import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/jwt.js";
import User from "../models/User.js";

function signToken(uid: string, email: string) {
  return jwt.sign({ uid, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

function newUserId() {
  return crypto.randomUUID();
}

/**
 * POST /api/auth/register
 * Equivalent to Firebase `createUserWithEmailAndPassword` + writing the
 * Firestore `users/{uid}` profile document, combined into one call.
 */
export async function register(req: Request, res: Response) {
  try {
    const { email, password, username, name, role, branch, avatar } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password should be at least 6 characters." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "This email address is already registered. Please sign in instead." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const uid = newUserId();
    const fallbackUsername = username || normalizedEmail.split("@")[0];

    // Fields not supplied at signup time (username/name/role/branch) get
    // sensible placeholders. The frontend immediately follows registration
    // with a full profile write (setDoc on users/{uid}), so these are only
    // ever visible for the instant between the two calls.
    const newUser = await User.create({
      _id: uid,
      username: String(fallbackUsername).trim().toLowerCase(),
      name: name ? String(name).trim() : fallbackUsername,
      role: role || "THERAPIST",
      branch: branch || "NAO_STUDIO",
      email: normalizedEmail,
      passwordHash,
      avatar: avatar || `https://i.pravatar.cc/150?u=${fallbackUsername}`,
      forcePasswordChange: false,
    });

    const token = signToken(uid, normalizedEmail);
    return res.status(201).json({ token, user: newUser.toJSON() });
  } catch (err: any) {
    console.error("Error in register:", err);
    return res.status(500).json({ error: err.message || "Registration failed." });
  }
}

/**
 * POST /api/auth/login
 * Equivalent to Firebase `signInWithEmailAndPassword`.
 */
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password. Please verify your credentials." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password. Please verify your credentials." });
    }

    const token = signToken(user._id, user.email);
    return res.status(200).json({ token, user: user.toJSON() });
  } catch (err: any) {
    console.error("Error in login:", err);
    return res.status(500).json({ error: err.message || "Authentication failed." });
  }
}

/**
 * GET /api/auth/me
 * Equivalent to reading the Firestore `users/{uid}` doc after
 * `onAuthStateChanged` fires with a signed-in Firebase user.
 */
export async function me(req: Request, res: Response) {
  try {
    if (!req.auth) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    const user = await User.findById(req.auth.uid);
    if (!user) {
      return res.status(404).json({ error: "User profile not found." });
    }
    return res.status(200).json({ user: user.toJSON() });
  } catch (err: any) {
    console.error("Error in me:", err);
    return res.status(500).json({ error: err.message || "Failed to load profile." });
  }
}

/**
 * POST /api/auth/change-password
 * Equivalent to Firebase `updatePassword(auth.currentUser, newPassword)`.
 * Used both for the normal "change my password" flow and for the
 * force-password-change flow after an admin reset.
 */
export async function changePassword(req: Request, res: Response) {
  try {
    if (!req.auth) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: "Password baru minimal 6 karakter." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const user = await User.findByIdAndUpdate(
      req.auth.uid,
      { passwordHash, forcePasswordChange: false },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ error: "User profile not found." });
    }

    return res.status(200).json({ success: true, user: user.toJSON() });
  } catch (err: any) {
    console.error("Error in changePassword:", err);
    return res.status(500).json({ error: err.message || "Gagal mengubah password." });
  }
}
