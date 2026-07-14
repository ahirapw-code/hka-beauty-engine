import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { verifyUserToken } from "../middleware/auth.js";
import User from "../models/User.js";

/**
 * POST /api/resetStaffPassword
 * Direct port of the original Firebase Admin Auth password-reset endpoint,
 * now hashing and storing the temporary password directly on the User model.
 */
export async function resetStaffPassword(req: Request, res: Response) {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "Missing required uid parameter." });
    }

    const authHeader = req.headers.authorization;
    const caller = await verifyUserToken(authHeader);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
    }

    const callerData = await User.findById(caller.uid);
    if (!callerData) {
      return res.status(403).json({ error: "Forbidden: User profile not found." });
    }
    if (callerData.role !== "HKA_MANAGEMENT") {
      return res.status(403).json({
        error: "Forbidden: Hanya HKA_MANAGEMENT yang diizinkan untuk menyetel ulang password.",
      });
    }

    const targetUser = await User.findById(uid);
    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found." });
    }

    // Generate a temporary 8-character random alphanumeric password
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let tempPassword = "";
    for (let i = 0; i < 8; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await User.updateOne(
      { _id: uid },
      { $set: { passwordHash, forcePasswordChange: true } }
    );

    return res.status(200).json({ success: true, tempPassword });
  } catch (err: any) {
    console.error("Error in resetStaffPassword:", err);
    return res.status(500).json({ error: err.message || "Error resetting staff password." });
  }
}
