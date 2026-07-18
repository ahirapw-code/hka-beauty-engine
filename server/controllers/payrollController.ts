import { Request, Response } from "express";
import Therapist from "../models/Therapist.js";
import User from "../models/User.js";
import Payroll from "../models/Payroll.js";
import Transaction from "../models/Transaction.js";
import Attendance from "../models/Attendance.js";

const VALID_BRANCHES = ["NAO_STUDIO", "DIAEL_BEAUTY"];

function monthRange(periodMonth: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = periodMonth.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);
  month++;
  if (month > 12) {
    month = 1;
    year++;
  }
  const nextMonthStr = `${year}-${String(month).padStart(2, "0")}`;
  return { startDate: `${periodMonth}-01`, endDate: `${nextMonthStr}-01` };
}

/**
 * GET /api/payroll/preview?branch=NAO_STUDIO&periodMonth=2026-07&staffType=therapist|manager
 *
 * Replaces the previous client-side pattern (Payroll.tsx) of looping over
 * every therapist/manager and firing 2-3 sequential HTTP round trips each
 * (one per calculateTherapistPayrollForPeriod / calculateStaffAttendance
 * call) - which is what produced 504s once staff count grew. This does the
 * equivalent work in a fixed, small number of bulk queries regardless of
 * how many staff there are:
 *   1. the staff list itself (therapists or managers) for the branch
 *   2. existing payroll records for the branch/period
 *   3. all transactions in the branch/period date range (one query - not
 *      one per therapist), aggregated in memory into per-staff commission
 *   4. all attendance rows for the relevant staff/period date range (one
 *      query - not one per staff), aggregated into per-staff days present
 *
 * Both branch and the periodMonth date range are pushed into the actual
 * Mongo query filters (not fetched wholesale and filtered in JS), matching
 * how `processCheckout` already filters everything server-side.
 */
export async function getPayrollPreview(req: Request, res: Response) {
  try {
    const role = req.auth?.role;
    if (!role) return res.status(401).json({ error: "Unauthorized." });
    if (role !== "HKA_MANAGEMENT" && role !== "SALON_MANAGER") {
      return res.status(403).json({ error: "Forbidden: only management may view payroll." });
    }

    const branch = String(req.query.branch || "");
    const periodMonth = String(req.query.periodMonth || "");
    const staffType = String(req.query.staffType || "therapist");

    if (!VALID_BRANCHES.includes(branch)) {
      return res.status(400).json({ error: `Invalid branch "${branch}".` });
    }
    if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
      return res.status(400).json({ error: `Invalid periodMonth "${periodMonth}", expected YYYY-MM.` });
    }
    if (staffType !== "therapist" && staffType !== "manager") {
      return res.status(400).json({ error: `Invalid staffType "${staffType}".` });
    }
    // A SALON_MANAGER may only ever look at their own branch; only
    // HKA_MANAGEMENT (branch === 'ALL') can view an arbitrary one.
    if (req.auth?.branch !== "ALL" && req.auth?.branch !== branch) {
      return res.status(403).json({ error: "Forbidden: you may not view payroll for this branch." });
    }

    const { startDate, endDate } = monthRange(periodMonth);

    const existingPayrolls = await Payroll.find({ branch, periodMonth });

    if (staffType === "therapist") {
      const therapists = await Therapist.find({ branch });

      // One query for every transaction in this branch+month, instead of
      // one query per therapist re-scanning the same month over and over.
      const transactions = await Transaction.find({
        branch,
        date: { $gte: startDate, $lt: endDate },
      }).select("items");

      const therapistsById = new Map(therapists.map((t) => [t._id, t]));
      const commissionByTherapistId = new Map<string, number>();
      for (const tx of transactions) {
        for (const item of tx.items) {
          if (!item.therapistId) continue;
          const therapist = therapistsById.get(item.therapistId);
          if (!therapist) continue; // e.g. a manager assigned in POS, not payroll-relevant here
          const commission = item.price * item.quantity * (therapist.commissionRate || 0);
          commissionByTherapistId.set(
            item.therapistId,
            (commissionByTherapistId.get(item.therapistId) || 0) + commission
          );
        }
      }

      // Attendance is keyed by userId - a dual-role manager clocks in
      // under their own User id (linkedUserId), not the Therapist _id.
      const attendanceKeys = therapists.map((t) => t.linkedUserId || t._id);
      const attendanceRows = await Attendance.find({
        userId: { $in: attendanceKeys },
        status: "completed",
        date: { $gte: startDate, $lt: endDate },
      }).select("userId");

      const daysPresentByKey = new Map<string, number>();
      for (const row of attendanceRows) {
        daysPresentByKey.set(row.userId, (daysPresentByKey.get(row.userId) || 0) + 1);
      }

      const previews: Record<string, { baseSalary: number; commissionEarned: number; daysPresent: number }> = {};
      for (const therapist of therapists) {
        const attendanceKey = therapist.linkedUserId || therapist._id;
        const daysPresent = daysPresentByKey.get(attendanceKey) || 0;
        previews[therapist._id] = {
          baseSalary: Math.round((therapist.baseSalary || 0) * daysPresent),
          commissionEarned: Math.round(commissionByTherapistId.get(therapist._id) || 0),
          daysPresent,
        };
      }

      return res.status(200).json({
        staff: therapists.map((t) => t.toJSON()),
        existingPayrolls: existingPayrolls.map((p) => p.toJSON()),
        previews,
      });
    }

    // staffType === "manager"
    const managers = await User.find({ role: "SALON_MANAGER", branch });
    const linkedTherapists = await Therapist.find({ branch, linkedUserId: { $exists: true, $ne: null } });
    const linkedTherapistsByUserId: Record<string, any> = {};
    for (const t of linkedTherapists) {
      if (t.linkedUserId) linkedTherapistsByUserId[t.linkedUserId] = t.toJSON();
    }

    const managerIds = managers.map((m) => m._id);
    const attendanceRows = await Attendance.find({
      userId: { $in: managerIds },
      status: "completed",
      date: { $gte: startDate, $lt: endDate },
    }).select("userId");

    const daysPresentByUserId = new Map<string, number>();
    for (const row of attendanceRows) {
      daysPresentByUserId.set(row.userId, (daysPresentByUserId.get(row.userId) || 0) + 1);
    }

    const previews: Record<string, { baseSalary: number; commissionEarned: number; daysPresent: number }> = {};
    for (const manager of managers) {
      const daysPresent = daysPresentByUserId.get(manager._id) || 0;
      previews[manager._id] = {
        baseSalary: manager.baseSalary || 0,
        commissionEarned: 0, // entered manually by HKA management, same as before
        daysPresent,
      };
    }

    return res.status(200).json({
      staff: managers.map((m) => m.toJSON()),
      existingPayrolls: existingPayrolls.map((p) => p.toJSON()),
      previews,
      linkedTherapistsByUserId,
    });
  } catch (err: any) {
    console.error("Error in getPayrollPreview:", err);
    return res.status(500).json({ error: err.message || "Failed to load payroll preview." });
  }
}
