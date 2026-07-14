// CRITICAL: fail fast if JWT_SECRET is missing, in every environment.
// A silently-applied insecure fallback would let anyone forge valid tokens
// (including HKA_MANAGEMENT tokens) for a misconfigured deployment.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16) {
  throw new Error(
    "FATAL: JWT_SECRET is not set (or is too short). Set a long, random JWT_SECRET " +
      "in your environment before starting the server. Generate one with: openssl rand -hex 64"
  );
}

export const JWT_SECRET: string = process.env.JWT_SECRET;
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || "1d";
