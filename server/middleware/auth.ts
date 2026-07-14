import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/jwt";
import User from "../models/User";

export interface AuthPayload {
  uid: string;
  email: string;
  role?: string;
  branch?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

/**
 * Verifies the Bearer JWT on the Authorization header.
 * Equivalent replacement for Firebase Admin's `auth.verifyIdToken`.
 */
export async function verifyUserToken(
  authHeader?: string
): Promise<{ uid: string; email: string } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    return { uid: decoded.uid, email: decoded.email || "" };
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}

/**
 * Express middleware: requires a valid JWT and attaches `req.auth`.
 * Responds 401 if missing/invalid.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const caller = await verifyUserToken(req.headers.authorization);
  if (!caller) {
    return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
  }
  req.auth = caller;
  next();
}

/**
 * Loads the caller's full user profile from MongoDB (role/branch) and attaches
 * it to req.auth. Equivalent to the old server.ts pattern of reading
 * firestore.collection("users").doc(caller.uid).get() after verifying the token.
 */
export async function requireAuthWithProfile(req: Request, res: Response, next: NextFunction) {
  const caller = await verifyUserToken(req.headers.authorization);
  if (!caller) {
    return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
  }
  const userDoc = await User.findById(caller.uid).select("+passwordHash");
  if (!userDoc) {
    return res.status(403).json({ error: "Forbidden: User profile not found." });
  }
  req.auth = {
    uid: caller.uid,
    email: caller.email,
    role: userDoc.role,
    branch: userDoc.branch,
  };
  next();
}
