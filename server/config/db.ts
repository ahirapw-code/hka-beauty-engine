import mongoose from "mongoose";

let isConnected = false;

/**
 * Connects to MongoDB Atlas using Mongoose.
 * Safe to call multiple times (e.g. in serverless functions) - it will
 * reuse the existing connection instead of opening a new one every time.
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Please configure it in your environment (.env or Vercel project settings)."
    );
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME || undefined,
  });

  isConnected = true;

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
  });

  mongoose.connection.on("disconnected", () => {
    isConnected = false;
  });

  console.log("Connected to MongoDB Atlas");
  return mongoose;
}

export default connectToDatabase;
