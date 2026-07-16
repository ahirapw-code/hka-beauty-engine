import { Request, Response } from "express";
import crypto from "crypto";
import { verifyUserToken } from "../middleware/auth.js";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Expense from "../models/Expense.js";
import Payroll from "../models/Payroll.js";

/**
 * These endpoints exist because customers/products/services/bookings/
 * expenses/payroll/etc are now write-locked in the generic /api/data API
 * (see server/middleware/authorize.ts) - business data can only be edited
 * through the connected Google Sheet. But some records are legitimately
 * *created* by real-world app actions (a booking gets made, an expense gets
 * logged, a payroll period gets run) rather than typed into a spreadsheet.
 * These controllers allow that one "create" action and nothing else -
 * there is deliberately no update/delete here. Corrections go through
 * Sheets.
 */

async function getCallerRole(req: Request): Promise<string | null> {
  const caller = await verifyUserToken(req.headers.authorization);
  if (!caller) return null;
  const userData = await User.findById(caller.uid);
  return userData?.role || null;
}

/** POST /api/bookings - create a new booking (any authenticated role, same as before). */
export async function createBooking(req: Request, res: Response) {
  try {
    const role = await getCallerRole(req);
    if (!role) return res.status(401).json({ error: "Unauthorized." });

    const id = "bk-" + Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex");
    const doc = await Booking.create({ ...req.body, _id: id, status: req.body.status || "pending" });
    return res.status(200).json({ success: true, id, data: doc.toJSON() });
  } catch (err: any) {
    console.error("Error in createBooking:", err);
    return res.status(500).json({ error: err.message || "Failed to create booking." });
  }
}

/**
 * PATCH /api/bookings/:id/status - the one deliberate exception to the
 * "bookings is write-locked, corrections go through Sheets" rule above.
 * Check-in / complete / cancel are real-time front-desk and therapist
 * actions (see Bookings.tsx and Dashboard.tsx) - routing them through a
 * Sheet edit + poll cycle isn't workable, so this narrow endpoint only
 * ever touches the `status` field and nothing else.
 */
export async function updateBookingStatus(req: Request, res: Response) {
  try {
    const role = await getCallerRole(req);
    if (!role) return res.status(401).json({ error: "Unauthorized." });

    const { id } = req.params;
    const { status } = req.body || {};

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ error: "Booking not found." });

    booking.status = status;
    await booking.save();

    return res.status(200).json({ success: true, data: booking.toJSON() });
  } catch (err: any) {
    console.error("Error in updateBookingStatus:", err);
    return res.status(500).json({ error: err.message || "Failed to update booking status." });
  }
}

/** POST /api/expenses - log a new expense (management only, same as before). */
export async function createExpense(req: Request, res: Response) {
  try {
    const role = await getCallerRole(req);
    if (!role) return res.status(401).json({ error: "Unauthorized." });
    if (role !== "HKA_MANAGEMENT" && role !== "SALON_MANAGER") {
      return res.status(403).json({ error: "Forbidden: only management may log expenses." });
    }

    const id = "exp-" + Date.now().toString(36) + "-" + crypto.randomBytes(3).toString("hex");
    const doc = await Expense.create({ ...req.body, _id: id });
    return res.status(200).json({ success: true, id, data: doc.toJSON() });
  } catch (err: any) {
    console.error("Error in createExpense:", err);
    return res.status(500).json({ error: err.message || "Failed to log expense." });
  }
}

/**
 * POST /api/payroll/run - create a new payroll record for a staff member/
 * period (management only). This only ever inserts a fresh record - if one
 * already exists for this staffId+periodMonth, it's rejected rather than
 * overwritten, since corrections to an existing payroll run now go through
 * Sheets, not a re-run from the app.
 */
export async function createPayrollRun(req: Request, res: Response) {
  try {
    const role = await getCallerRole(req);
    if (!role) return res.status(401).json({ error: "Unauthorized." });
    if (role !== "HKA_MANAGEMENT" && role !== "SALON_MANAGER") {
      return res.status(403).json({ error: "Forbidden: only management may run payroll." });
    }

    const { staffId, periodMonth, id: clientId } = req.body || {};
    if (!staffId || !periodMonth) {
      return res.status(400).json({ error: "Missing staffId or periodMonth." });
    }

    const id = clientId || `payroll_${staffId}_${periodMonth}`;
    const existing = await Payroll.findById(id);
    if (existing) {
      return res.status(409).json({
        error:
          "A payroll record for this staff member/period already exists. " +
          "To correct it, edit the record in the Google Sheet instead of re-running it here.",
      });
    }

    const { id: _drop, ...rest } = req.body;
    const doc = await Payroll.create({ ...rest, _id: id });
    return res.status(200).json({ success: true, id, data: doc.toJSON() });
  } catch (err: any) {
    console.error("Error in createPayrollRun:", err);
    return res.status(500).json({ error: err.message || "Failed to create payroll run." });
  }
}
