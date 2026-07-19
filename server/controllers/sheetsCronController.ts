import { Request, Response } from "express";
import Setting from "../models/Setting.js";
import { persistSheetsData, type SheetsSyncPayload } from "./sheetsPersistController.js";

/**
 * POST /api/cron/sync-sheets
 *
 * WHY THIS EXISTS: the browser-triggered sync (POST /api/sheets/persist)
 * only ever runs while an HKA_MANAGEMENT or SALON_MANAGER session is open
 * (see the role check there, and the isHQManagement/canPersist checks in
 * GoogleSheetsSync.tsx). If only therapists/cashiers log in on a given day,
 * a direct edit made in the Google Sheet is read into their browser but
 * never durably saved to MongoDB - it just reverts on the next refresh.
 *
 * This endpoint closes that gap without loosening the role check anywhere:
 * it runs on a Vercel Cron schedule (see vercel.json "crons"), independent
 * of any browser session, and is authenticated with a single shared secret
 * (CRON_SECRET) instead of a user's role. It reuses persistSheetsData - the
 * exact same audited write path (including AUDIT_OWNED_FIELDS protection for
 * payroll-owned fields like commissionRate/baseSalary) - so this can't
 * accidentally become a wider hole than the manual sync already is.
 *
 * AUTH: Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on
 * requests it triggers itself, as long as the CRON_SECRET env var is set on
 * the project (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 * If CRON_SECRET isn't configured, this endpoint refuses every request
 * (fail closed) rather than silently accepting unauthenticated calls.
 */
export async function cronSyncSheets(req: Request, res: Response) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret) {
      console.error("cronSyncSheets: CRON_SECRET is not configured - refusing to run.");
      return res.status(500).json({ error: "CRON_SECRET not configured on the server." });
    }
    if (req.headers.authorization !== `Bearer ${expectedSecret}`) {
      return res.status(401).json({ error: "Unauthorized: invalid or missing cron secret." });
    }

    const config = await Setting.findById("sheets_config");
    const spreadsheetId: string | undefined = config?.get("spreadsheetId");
    const appsScriptUrl: string | undefined = config?.get("appsScriptUrl");

    if (!spreadsheetId || !appsScriptUrl) {
      // Nothing connected yet - not an error, just nothing to do.
      return res.status(200).json({ success: true, skipped: true, reason: "Sheets sync not configured." });
    }

    const fetchRes = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", spreadsheetId }),
    });
    if (!fetchRes.ok) {
      throw new Error(`Apps Script fetch failed with status ${fetchRes.status}`);
    }
    const json: any = await fetchRes.json();
    if (json.status !== "success") {
      throw new Error(json.message || "Apps Script failed to read the spreadsheet.");
    }
    const raw: Record<string, any[][]> = json.data || {};

    const payload: SheetsSyncPayload = {
      customers: rowsToObjects(raw["Customers"], CUSTOMERS_HEADERS),
      bookings: rowsToObjects(raw["Bookings"], BOOKINGS_HEADERS),
      transactions: rowsToObjects(raw["Transactions"], TRANSACTIONS_HEADERS),
      // commissionRate/baseSalary/currentSales/totalCommissionEarned are
      // dropped by AUDIT_OWNED_FIELDS inside persistSheetsData regardless,
      // so sending them through here is harmless - they're simply ignored,
      // matching how the manual sync already behaves.
      therapists: rowsToObjects(raw["Therapists"], THERAPISTS_HEADERS),
      products: rowsToObjects(raw["Products"], PRODUCTS_HEADERS),
      services: rowsToObjects(raw["Services"], SERVICES_HEADERS),
      expenses: rowsToObjects(raw["Expenses"], EXPENSES_HEADERS),
      attendance: rowsToObjects(raw["Attendance"], ATTENDANCE_HEADERS),
    };

    const { written, deleted } = await persistSheetsData(payload);
    return res.status(200).json({ success: true, written, deleted });
  } catch (err: any) {
    console.error("Error in cronSyncSheets:", err);
    return res.status(500).json({ error: err.message || "Scheduled Sheets sync failed." });
  }
}

// Column order for each tab, matching SHEET_SCHEMAS in the Apps Script code
// (src/components/GoogleSheetsSync.tsx APPS_SCRIPT_CODE) and the ranges read
// in src/lib/googleSheets.ts. 'Users' is intentionally excluded - same as
// the manual /api/sheets/persist path, account fields never flow through
// a generic Sheets sync.
const CUSTOMERS_HEADERS = ["id", "name", "email", "phone", "totalSpend", "visitsCount", "lastVisit", "notes", "preferredBranch", "isMember", "memberSince"];
const BOOKINGS_HEADERS = ["id", "customerName", "customerPhone", "serviceId", "serviceName", "therapistId", "therapistName", "branch", "date", "time", "duration", "price", "status", "notes"];
const TRANSACTIONS_HEADERS = ["id", "date", "customerName", "branch", "subtotal", "discount", "total", "paymentMethod", "cashierName", "items_json"];
const THERAPISTS_HEADERS = ["id", "name", "branch", "specialties", "rating", "commissionRate", "totalCommissionEarned", "status", "monthlyTarget", "currentSales", "baseSalary", "linkedUserId"];
const PRODUCTS_HEADERS = ["id", "name", "sku", "price", "cost", "stock", "minStock", "branch", "category"];
const SERVICES_HEADERS = ["id", "name", "category", "price", "duration", "branches"];
const EXPENSES_HEADERS = ["id", "branch", "category", "amount", "date", "description"];
const ATTENDANCE_HEADERS = ["id", "userId", "userName", "role", "branch", "date", "clockIn", "clockOut", "status", "notes"];

const NUMERIC_FIELDS = new Set([
  "totalSpend", "visitsCount", "price", "duration", "subtotal", "discount", "total",
  "rating", "commissionRate", "totalCommissionEarned", "monthlyTarget", "currentSales",
  "cost", "stock", "minStock", "amount", "baseSalary",
]);

// Coerce a sheet cell into a number even if it arrived as a formatted
// display string (e.g. "Rp50.000"). Mirrors parseNumericCell in
// src/lib/googleSheets.ts so server-side parsing behaves identically.
function parseNumericCell(val: any): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (val === null || val === undefined || val === "") return 0;
  const direct = Number(val);
  if (Number.isFinite(direct)) return direct;
  const cleaned = String(val).replace(/[^0-9.,-]/g, "");
  if (!cleaned) return 0;
  const decimalMatch = cleaned.match(/[.,](\d{1,2})$/);
  let normalized: string;
  if (decimalMatch) {
    const decimals = decimalMatch[1];
    const wholePart = cleaned.slice(0, cleaned.length - decimals.length - 1).replace(/[.,]/g, "");
    normalized = `${wholePart}.${decimals}`;
  } else {
    normalized = cleaned.replace(/[.,]/g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Same row->object shape as parseRawSheetValues in src/lib/googleSheets.ts,
// duplicated here (rather than imported) because that file pulls in
// browser-only Google/Firebase auth modules that don't belong in the
// server bundle.
function rowsToObjects(rows: any[][] | undefined, headers: string[]): Record<string, any>[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((header, i) => {
      const val = row[i];
      if (NUMERIC_FIELDS.has(header)) {
        obj[header] = parseNumericCell(val);
      } else if (header === "isMember") {
        obj[header] = val === true || String(val).trim().toUpperCase() === "TRUE" || String(val).trim() === "1";
      } else if (header === "specialties" || header === "branches") {
        obj[header] = val ? String(val).split(",") : [];
      } else if (header === "items_json") {
        try {
          obj["items"] = val ? JSON.parse(val) : [];
        } catch {
          obj["items"] = [];
        }
      } else {
        obj[header] = val || "";
      }
    });
    return obj;
  });
}
