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
 * NOTE ON THE TWO SYNC ENDPOINTS: this endpoint and
 * POST /api/syncSheetsToFirestore (server/controllers/googleSheetsController.ts)
 * are not redundant - they cover different data:
 *   - /api/sheets/persist  → the 8 main collections tracked by the
 *     client-side sync engine (Customers, Bookings, Transactions,
 *     Therapists, Products, Services, Expenses, Attendance).
 *   - /api/syncSheetsToFirestore → payroll/commission-rate fields only,
 *     which aren't part of that client-side engine yet. It's called right
 *     after this one on every sync (see GoogleSheetsSync.tsx).
 * If payroll ever gets added as a proper tab in the main sync engine, this
 * split can be retired - until then, both are needed.
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
 * so a Sheets edit is durable and visible to everyone.
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

  const ops = rows
    .map((row) => {
      const id = row.id || row._id;
      if (!id) return null;
      const fields = { ...row };
      delete fields.id;
      delete fields._id;
      return {
        updateOne: {
          filter: { _id: id },
          update: { $set: fields },
          upsert: true,
          setDefaultsOnInsert: true,
        },
      };
    })
    .filter((op): op is NonNullable<typeof op> => op !== null);

  if (ops.length === 0) return 0;

  // One network round-trip for the whole collection instead of one per
  // record - the previous sequential findByIdAndUpdate loop was slow
  // enough on larger real-world datasets (bookings/transactions especially)
  // to blow past Vercel's function time limit and return a 504, which
  // silently dropped the entire sync (nothing got persisted, no partial
  // progress either, since the timeout kills the function mid-loop).
  // Using the Mongoose Model's own bulkWrite (not the raw driver
  // collection) keeps schema-level casting and setDefaultsOnInsert intact.
  const result = await model.bulkWrite(ops, { ordered: false });
  return (result.upsertedCount || 0) + (result.modifiedCount || 0);
}

async function deleteRows(model: any, ids: string[] | undefined) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const result = await model.deleteMany({ _id: { $in: ids } });
  return result.deletedCount || 0;
}

export async function persistSheetsSync(req: Request, res: Response) {
  try {
    const caller = await verifyUserToken(req.headers.authorization);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
    }
    const userData = await User.findById(caller.uid);
    if (!userData) {
      return res.status(403).json({ error: "Forbidden: user profile not found." });
    }
    // Any authenticated staff member can trigger this - the background sync
    // runs in every role's browser (cashier, therapist, branch manager, not
    // just HKA_MANAGEMENT), and it only ever applies the Sheet's own data,
    // never arbitrary client input, so there's no extra risk in allowing it.

    const { customers, bookings, transactions, therapists, products, services, expenses, attendance, deletedIds } =
      req.body || {};

    const [
      customersWritten, bookingsWritten, transactionsWritten, therapistsWritten,
      productsWritten, servicesWritten, expensesWritten, attendanceWritten,
    ] = await Promise.all([
      upsertRows(Customer, customers),
      upsertRows(Booking, bookings),
      upsertRows(Transaction, transactions),
      upsertRows(Therapist, therapists),
      upsertRows(Product, products),
      upsertRows(Service, services),
      upsertRows(Expense, expenses),
      upsertRows(Attendance, attendance),
    ]);
    const written = {
      customers: customersWritten,
      bookings: bookingsWritten,
      transactions: transactionsWritten,
      therapists: therapistsWritten,
      products: productsWritten,
      services: servicesWritten,
      expenses: expensesWritten,
      attendance: attendanceWritten,
    };

    // Rows that were genuinely removed from the Sheet (not just missing due
    // to a bad/partial read - see the headers-length guard in
    // syncStateToSpreadsheetIncremental) get deleted from MongoDB too,
    // otherwise a deletion in the Sheet would never actually stick.
    const [
      customersDeleted, bookingsDeleted, transactionsDeleted, therapistsDeleted,
      productsDeleted, servicesDeleted, expensesDeleted, attendanceDeleted,
    ] = await Promise.all([
      deleteRows(Customer, deletedIds?.Customers),
      deleteRows(Booking, deletedIds?.Bookings),
      deleteRows(Transaction, deletedIds?.Transactions),
      deleteRows(Therapist, deletedIds?.Therapists),
      deleteRows(Product, deletedIds?.Products),
      deleteRows(Service, deletedIds?.Services),
      deleteRows(Expense, deletedIds?.Expenses),
      deleteRows(Attendance, deletedIds?.Attendance),
    ]);
    const deleted = {
      customers: customersDeleted,
      bookings: bookingsDeleted,
      transactions: transactionsDeleted,
      therapists: therapistsDeleted,
      products: productsDeleted,
      services: servicesDeleted,
      expenses: expensesDeleted,
      attendance: attendanceDeleted,
    };

    return res.status(200).json({ success: true, written, deleted });
  } catch (err: any) {
    console.error("Error in persistSheetsSync:", err);
    return res.status(500).json({ error: err.message || "Failed to persist Sheets sync." });
  }
}
