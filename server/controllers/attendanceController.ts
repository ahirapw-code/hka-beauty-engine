import { Request, Response } from "express";
import crypto from "crypto";
import { verifyUserToken } from "../middleware/auth.js";
import User from "../models/User.js";
import Attendance from "../models/Attendance.js";

/**
 * POST /api/clockInOut
 * Direct Mongoose port of the original Firestore-backed clockInOut endpoint.
 */
export async function clockInOut(req: Request, res: Response) {
  try {
    const { action, attendanceId, record } = req.body;

    const authHeader = req.headers.authorization;
    const caller = await verifyUserToken(authHeader);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
    }

    const userData = await User.findById(caller.uid);
    if (!userData) {
      return res.status(403).json({ error: "Forbidden: User profile not found." });
    }
    const isHkaManagement = userData.role === "HKA_MANAGEMENT";

    if (action === "clockIn") {
      if (!isHkaManagement && record.userId !== caller.uid) {
        return res
          .status(403)
          .json({ error: "Forbidden: Anda hanya diperbolehkan clock in untuk diri sendiri." });
      }

      const attId = "att-" + Math.floor(Math.random() * 9000 + 1000) + "-" + crypto.randomBytes(2).toString("hex");
      await Attendance.create({
        _id: attId,
        userId: record.userId,
        userName: record.userName,
        role: record.role,
        branch: record.branch,
        date: record.date,
        clockIn: record.clockIn,
        status: "active",
        notes: record.notes || "",
      });
      return res.status(200).json({ success: true, id: attId });
    } else if (action === "clockOut") {
      if (!attendanceId) {
        return res.status(400).json({ error: "Missing attendanceId parameter." });
      }

      const existingData = await Attendance.findById(attendanceId);
      if (!existingData) {
        return res.status(404).json({ error: "Attendance record not found." });
      }

      if (!isHkaManagement && existingData.userId !== caller.uid) {
        return res
          .status(403)
          .json({ error: "Forbidden: Anda hanya diperbolehkan clock out untuk diri sendiri." });
      }

      const updateData: any = {
        clockOut: record.clockOut,
        status: "completed",
      };
      if (record.notes) {
        updateData.notes = record.notes;
      }

      await Attendance.updateOne({ _id: attendanceId }, { $set: updateData });
      return res.status(200).json({ success: true });
    } else {
      return res.status(400).json({ error: "Invalid action parameter." });
    }
  } catch (err: any) {
    console.error("Error in clockInOut:", err);
    return res.status(500).json({ error: err.message || "Error processing attendance" });
  }
}
