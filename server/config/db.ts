import mongoose from "mongoose";

let isConnected = false;
// Guards against multiple concurrent requests each trying to (re)connect
// at the same time on a cold/half-woken serverless instance.
let connectingPromise: Promise<typeof mongoose> | null = null;

/**
 * A cheap, fast liveness check for the current Mongoose connection.
 *
 * The root cause of the "users.findOne() buffering timeout on checkout"
 * bug: `mongoose.connection.readyState === 1` can lie after a serverless
 * function is frozen/thawed by the platform (Vercel) - the socket the
 * driver thinks is open is actually dead, but Mongoose won't notice until
 * a real query is attempted, at which point (with buffering on) it just
 * queues silently and eventually times out with a confusing internal
 * error instead of failing fast.
 *
 * `db.command({ ping: 1 })` is a trivial round-trip that proves the
 * connection can actually talk to Atlas right now, not just that the
 * driver's internal state flag says "connected".
 */
async function isConnectionHealthy(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return false;
  }
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

async function establishConnection(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Please configure it in your environment (.env or Vercel project settings)."
    );
  }

  mongoose.set("strictQuery", true);

  // Disable Mongoose's default query buffering. With buffering on, a query
  // issued while the connection is down/reconnecting just sits in an
  // internal queue until `bufferTimeoutMS` (10s default) elapses, and only
  // then surfaces as an opaque "buffering timed out" error - which on
  // Vercel usually shows up to the cashier as a raw alert() after the
  // platform's own function timeout has already fired. Turning buffering
  // off makes a query fail immediately and clearly ("not connected") when
  // there's genuinely no usable connection, instead of hanging.
  mongoose.set("bufferCommands", false);

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME || undefined,
    bufferCommands: false,
    // Fail fast with a real error instead of hanging until the platform's
    // own function timeout kills the process silently.
    serverSelectionTimeoutMS: 8000,
    // Keep the pool small - this app runs inside short-lived serverless
    // functions, not a long-running server, so a large pool just wastes
    // Atlas connection slots across concurrent invocations.
    maxPoolSize: 10,
  });

  isConnected = true;

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
    isConnected = false;
  });

  mongoose.connection.on("disconnected", () => {
    isConnected = false;
  });

  console.log("Connected to MongoDB Atlas");
  return mongoose;
}

/**
 * Connects to MongoDB Atlas using Mongoose. Safe to call on every request
 * (e.g. from Express middleware in a serverless function) - it reuses the
 * existing connection when it's actually healthy, and transparently
 * reconnects when it isn't, instead of trusting a stale `readyState` flag.
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  if (isConnected && (await isConnectionHealthy())) {
    return mongoose;
  }

  // If another concurrent request already kicked off a (re)connect, wait
  // for that instead of racing it with a second `mongoose.connect()` call.
  if (connectingPromise) {
    return connectingPromise;
  }

  isConnected = false;

  connectingPromise = (async () => {
    try {
      // A previous connection that's gone stale (e.g. after a frozen
      // serverless instance thaws with a dead socket) needs to be torn
      // down before reconnecting - `mongoose.connect()` on top of a
      // half-dead connection is exactly the "zombie connection" scenario.
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => {
          /* best-effort - proceed to reconnect regardless */
        });
      }
      return await establishConnection();
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

/**
 * Runs `fn` and, if it fails with a transient connection-level error
 * (buffering timeout because the connection wasn't actually ready, or a
 * dropped-socket network error), forces a fresh reconnect and retries
 * exactly once with a brand new connection - instead of surfacing a raw
 * Mongoose error straight to the user on the first hiccup after an idle
 * period. Business-logic errors (validation, not-found, insufficient
 * stock, etc.) are never retried - they're rethrown immediately.
 */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    if (!isTransientConnectionError(err)) {
      throw err;
    }
    console.warn("Transient DB connection error, forcing reconnect and retrying once:", err?.message);
    isConnected = false;
    await connectToDatabase();
    return fn();
  }
}

function isTransientConnectionError(err: any): boolean {
  const message: string = String(err?.message || "");
  return (
    err?.name === "MongoNetworkError" ||
    err?.name === "MongooseError" && message.toLowerCase().includes("buffering timed out") ||
    message.toLowerCase().includes("buffering timed out") ||
    message.toLowerCase().includes("not connected") ||
    message.toLowerCase().includes("topology was destroyed") ||
    err?.code === "ECONNRESET"
  );
}

export default connectToDatabase;
