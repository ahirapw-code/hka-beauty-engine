import { Request, Response } from "express";
import { verifyUserToken } from "../middleware/auth.js";
import User from "../models/User.js";
import Customer from "../models/Customer.js";
import Booking from "../models/Booking.js";
import Transaction from "../models/Transaction.js";
import Therapist from "../models/Therapist.js";
import Product from "../models/Product.js";
import Service from "../models/Service.js";
import Expense from "../models/Expense.js";
import Attendance from "../models/Attendance.js";

/**
 * POST /api/sheets/persist
 *
 * The frontend's Google Sheets sync engine (src/lib/googleSheets.ts,
 * syncStateToSpreadsheetIncremental) already reads the connected spreadsheet,
 * reconciles it against in-memory app state, and resolves conflicts in favor
 * of the sheet. But it only ever updates React state in the browser - it
 * never reached the database, so a page refresh (or a second person's
 * session) would never see a change someone made in Sheets.
 *
 * This endpoint is the missing other half: it takes that same reconciled
 * dataset and writes it into MongoDB, per-field ($set, not a full replace),
 * so a Sheets edit is durable and visible to everyone. This is the ONE path
 * allowed to write these collections outside of a dedicated business
 * controller (checkout/clockInOut/createBooking/createExpense/payroll run) -
 * enforced by requiring HKA_MANAGEMENT, since only the person managing the
 * spreadsheet should be able to trigger this.
 *
 * Deliberately excluded here: `users`. Sheets can rename/reassign a
 * therapist or product, but it must never be able to touch passwordHash or
 * other auth fields, and the frontend sync payload for users doesn't carry
 * a password anyway - account security stays entirely inside the existing
 * auth flow.
 */

type Row = Record<string, any>;

async function upsertRows(model: any, rows: Row[] | undefined) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let count = 0;
  for (const row of rows) {
    const id = row.id || row._id;
    if (!id) continue;
    const fields = { ...row };
    delete fields.id;
    delete fields._id;
    await model.findByIdAndUpdate(
      id,
      { $set: fields },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count++;
  }
  return count;
}

export async function persistSheetsSync(req: Request, res: Response) {
  try {
    const caller = await verifyUserToken(req.headers.authorization);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
    }
    const userData = await User.findById(caller.uid);
    if (!userData || userData.role !== "HKA_MANAGEMENT") {
      return res.status(403).json({
        error: "Forbidden: only HKA_MANAGEMENT may persist a Google Sheets sync.",
      });
    }

    const { customers, bookings, transactions, therapists, products, services, expenses, attendance } =
      req.body || {};

    const written = {
      customers: await upsertRows(Customer, customers),
      bookings: await upsertRows(Booking, bookings),
      transactions: await upsertRows(Transaction, transactions),
      therapists: await upsertRows(Therapist, therapists),
      products: await upsertRows(Product, products),
      services: await upsertRows(Service, services),
      expenses: await upsertRows(Expense, expenses),
      attendance: await upsertRows(Attendance, attendance),
    };

    return res.status(200).json({ success: true, written });
  } catch (err: any) {
    console.error("Error in persistSheetsSync:", err);
    return res.status(500).json({ error: err.message || "Failed to persist Sheets sync." });
  }
}
