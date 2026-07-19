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
 * ARCHITECTURE (single source of truth = the Sheet): this endpoint writes
 * whatever the connected Google Sheet says straight into MongoDB, for every
 * field on every one of the 8 tracked collections, including Therapist
 * commissionRate/baseSalary/monthlyTarget - regardless of who is logged in
 * when the sync runs (see persistSheetsSync below - no role restriction).
 *
 * Two things are deliberately NOT written here even though they otherwise
 * live on collections this endpoint manages:
 *
 * - `users`: Sheets can rename/reassign a therapist or product, but must
 *   never touch passwordHash or other auth fields - account security stays
 *   entirely inside the existing auth flow. Salon Manager payroll fields
 *   instead flow through POST /api/syncSheetsToFirestore.
 *
 * - Therapist `currentSales`/`totalCommissionEarned` (see
 *   AUDIT_OWNED_FIELDS below): these are accumulators written by real
 *   checkouts, not plain human-set fields, and this endpoint's payload
 *   comes from a browser's local/cached state - which can be stale. They
 *   too flow through POST /api/syncSheetsToFirestore instead, which always
 *   reads the Sheet fresh from the Google Sheets API at request time.
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
 */

type Row = Record<string, any>;

/**
 * Fields that must never be written through this endpoint even though they
 * live on collections this endpoint otherwise manages - reserved for cases
 * where a value truly can't come from the Sheet (nothing currently
 * qualifies for `therapists`; kept as an empty, documented seam rather than
 * removed outright in case a real auth-security field like this ever needs
 * one again). currentSales and totalCommissionEarned ARE locked here,
 * deliberately: they are accumulators written by real checkouts
 * (server/controllers/checkoutController.ts), and this endpoint's payload
 * comes from whatever a browser's local/cached state happens to hold at
 * sync time - a stale tab, an unrelated field edit on the Sheet, or a
 * device that hasn't seen the latest checkout yet can all trigger a push
 * here that would otherwise $set these two fields back to a stale number,
 * silently erasing real sales/commission. Sheet edits to these two fields
 * still work - they're picked up by syncSheetsToFirestore
 * (server/controllers/googleSheetsController.ts) instead, which always
 * reads the Sheet fresh from the Google Sheets API at request time rather
 * than trusting a browser's cached copy, and writes an audit log entry per
 * change. commissionRate/baseSalary/monthlyTarget are NOT locked - they're
 * plain human-set business inputs, not accumulators, so the generic
 * whole-row sync is an acceptable path for them.
 */
export const AUDIT_OWNED_FIELDS: Record<string, string[]> = {
  therapists: ["currentSales", "totalCommissionEarned"],
};

/**
 * Drops keys that can't legitimately be a business field name and would
 * otherwise be handed straight to Mongo's $set: Mongo operator-looking keys
 * ("$foo") and dotted paths ("a.b"), which could target a nested field the
 * writer shouldn't reach. Sheets column headers never produce either.
 */
export function sanitizeFields(fields: Row, ownedElsewhere: string[] | undefined): Row {
  const clean: Row = {};
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith("$") || key.includes(".")) continue;
    if (ownedElsewhere?.includes(key)) continue;
    clean[key] = value;
  }
  return clean;
}

export async function upsertRows(model: any, rows: Row[] | undefined, collectionName: string) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  const ops = rows
    .map((row) => {
      const id = row.id || row._id;
      if (!id || typeof id !== "string") return null;
      const fields = { ...row };
      delete fields.id;
      delete fields._id;
      const cleanFields = sanitizeFields(fields, AUDIT_OWNED_FIELDS[collectionName]);
      return {
        updateOne: {
          filter: { _id: id },
          update: { $set: cleanFields },
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

export async function deleteRows(model: any, ids: string[] | undefined) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const result = await model.deleteMany({ _id: { $in: ids } });
  return result.deletedCount || 0;
}

export interface SheetsSyncPayload {
  customers?: Row[];
  bookings?: Row[];
  transactions?: Row[];
  therapists?: Row[];
  products?: Row[];
  services?: Row[];
  expenses?: Row[];
  attendance?: Row[];
  deletedIds?: Record<string, string[] | undefined>;
}

/**
 * The actual write-to-MongoDB step, with no HTTP/auth concerns of its own -
 * called by persistSheetsSync below, which any authenticated staff session
 * can trigger from the app whenever the Sheets sync engine
 * (syncStateToSpreadsheetIncremental) reconciles a change, whether that
 * change originated in the app or from a manual edit in the Sheet itself.
 */
export async function persistSheetsData(payload: SheetsSyncPayload) {
  const { customers, bookings, transactions, therapists, products, services, expenses, attendance, deletedIds } =
    payload || {};

  const [
    customersWritten, bookingsWritten, transactionsWritten, therapistsWritten,
    productsWritten, servicesWritten, expensesWritten, attendanceWritten,
  ] = await Promise.all([
    upsertRows(Customer, customers, "customers"),
    upsertRows(Booking, bookings, "bookings"),
    upsertRows(Transaction, transactions, "transactions"),
    upsertRows(Therapist, therapists, "therapists"),
    upsertRows(Product, products, "products"),
    upsertRows(Service, services, "services"),
    upsertRows(Expense, expenses, "expenses"),
    upsertRows(Attendance, attendance, "attendance"),
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

  return { written, deleted };
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
    // Any authenticated staff (HKA_MANAGEMENT, SALON_MANAGER, THERAPIST, ...)
    // can trigger this now - opened up deliberately so a Sheets edit still
    // gets durably saved to MongoDB even on a day only therapists/cashiers
    // are logged in, instead of silently reverting on refresh.
    //
    // This is safe to open regardless of role because payroll-sensitive
    // fields (commissionRate, baseSalary, currentSales, totalCommissionEarned)
    // are stripped by sanitizeFields/AUDIT_OWNED_FIELDS below no matter who
    // the caller is - a THERAPIST session persisting a sync can't touch
    // those fields any more than a manager's accidental Sheets edit could.
    // Payroll changes still only ever flow through the dedicated, audited
    // /api/syncSheetsToFirestore path (HKA_MANAGEMENT only, with a
    // PayrollAuditLog entry per change).

    const { written, deleted } = await persistSheetsData(req.body || {});
    return res.status(200).json({ success: true, written, deleted });
  } catch (err: any) {
    console.error("Error in persistSheetsSync:", err);
    return res.status(500).json({ error: err.message || "Failed to persist Sheets sync." });
  }
}
