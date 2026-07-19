import { Request, Response } from "express";
import Therapist from "../models/Therapist.js";
import Setting from "../models/Setting.js";

/**
 * POST /api/cron/reset-monthly-sales
 *
 * WHY THIS EXISTS: "Monthly Target Progress" (TherapistTarget.tsx) compares
 * Therapist.currentSales against Therapist.monthlyTarget. currentSales is
 * accrued all month by processCheckout as sales happen - it's never meant
 * to reset itself, so something has to zero it out at the start of a new
 * cycle. This does that automatically, on a schedule, instead of relying on
 * someone remembering to do it (or clearing it in the Sheet, which - now
 * that the Sheet is the source of truth for this field too, see
 * sheetsPersistController.ts - would otherwise need to happen in both
 * places at once to actually stick).
 *
 * Deliberately scoped to `currentSales` only - NOT `totalCommissionEarned`.
 * currentSales is a progress-bar-style figure that's supposed to restart
 * every cycle. totalCommissionEarned is a cumulative payroll figure (what's
 * actually owed/paid to the therapist); zeroing that automatically on a
 * timer would be an accounting action, not a UI reset, and belongs in an
 * explicit payroll-run/payout step instead - see
 * PATCH /api/therapists/:id/commission-adjustment for the audited, manual
 * way to correct it. If a monthly reset of totalCommissionEarned is also
 * wanted (e.g. right after payroll is paid out), that should be a
 * deliberate decision, not folded silently into this job.
 *
 * AUTH: same CRON_SECRET pattern as sheetsCronController.ts - Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` automatically for its own Cron Job
 * requests when that env var is set. Fails closed if it isn't configured.
 */
export async function resetMonthlyTherapistSales(req: Request, res: Response) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret) {
      console.error("resetMonthlyTherapistSales: CRON_SECRET is not configured - refusing to run.");
      return res.status(500).json({ error: "CRON_SECRET not configured on the server." });
    }
    if (req.headers.authorization !== `Bearer ${expectedSecret}`) {
      return res.status(401).json({ error: "Unauthorized: invalid or missing cron secret." });
    }

    // Snapshot every therapist BEFORE resetting, so the Sheet row can be
    // rebuilt below using each therapist's real current values (with only
    // currentSales replaced), not stale/default data.
    const therapists = await Therapist.find({});
    if (therapists.length === 0) {
      return res.status(200).json({ success: true, resetCount: 0, sheetUpdated: false });
    }

    await Therapist.updateMany({}, { $set: { currentSales: 0 } });

    // Best-effort mirror into the Sheet, so it can't disagree with MongoDB
    // and undo this reset on the next regular sync. Not fatal if it fails -
    // the DB reset (the part that actually drives the in-app dashboard)
    // has already succeeded either way; the next regular sync will just
    // have one more real conflict to resolve (Sheet still has last month's
    // number, DB now has 0 -> Sheet currently wins per the unified
    // source-of-truth design, which would undo the reset in the Sheet's
    // favor). Logged clearly so a failed push here is easy to notice.
    let sheetUpdated = false;
    let sheetError: string | undefined;
    try {
      const config = await Setting.findById("sheets_config");
      const spreadsheetId: string | undefined = config?.get("spreadsheetId");
      const appsScriptUrl: string | undefined = config?.get("appsScriptUrl");

      if (spreadsheetId && appsScriptUrl) {
        const readRes = await fetch(appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "read", spreadsheetId }),
        });
        if (!readRes.ok) throw new Error(`Apps Script read failed with status ${readRes.status}`);
        const readJson: any = await readRes.json();
        if (readJson.status !== "success") throw new Error(readJson.message || "Apps Script failed to read the spreadsheet.");

        const rows: any[][] = readJson.data?.["Therapists"] || [];
        if (rows.length > 0) {
          const headers: string[] = rows[0];
          const idCol = headers.indexOf("id");
          const rowNumById = new Map<string, number>();
          if (idCol !== -1) {
            rows.slice(1).forEach((row, i) => {
              const id = row[idCol];
              if (id) rowNumById.set(id, i + 2); // +2: 1-indexed, plus header row
            });
          }

          const updates = therapists
            .map((t) => {
              const rowNum = rowNumById.get(t._id);
              if (!rowNum) return null;
              return {
                sheet: "Therapists",
                range: `Therapists!A${rowNum}`,
                values: [therapistToRow({ ...t.toJSON(), currentSales: 0 })],
              };
            })
            .filter((u): u is NonNullable<typeof u> => u !== null);

          if (updates.length > 0) {
            const writeRes = await fetch(appsScriptUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "write_incremental", spreadsheetId, updates }),
            });
            if (!writeRes.ok) throw new Error(`Apps Script write failed with status ${writeRes.status}`);
            const writeJson: any = await writeRes.json();
            if (writeJson.status !== "success") throw new Error(writeJson.message || "Apps Script failed to write.");
            sheetUpdated = true;
          }
        }
      }
    } catch (err: any) {
      sheetError = err.message || String(err);
      console.error("resetMonthlyTherapistSales: Sheet mirror failed (DB reset still applied):", sheetError);
    }

    return res.status(200).json({
      success: true,
      resetCount: therapists.length,
      sheetUpdated,
      ...(sheetError ? { sheetError } : {}),
    });
  } catch (err: any) {
    console.error("Error in resetMonthlyTherapistSales:", err);
    return res.status(500).json({ error: err.message || "Monthly sales reset failed." });
  }
}

// Column order for the "Therapists" tab - must match CUSTOMERS_HEADERS-style
// constants in sheetsCronController.ts / the Apps Script SHEET_SCHEMAS in
// src/components/GoogleSheetsSync.tsx.
function therapistToRow(t: any): (string | number)[] {
  return [
    t._id ?? t.id ?? "",
    t.name ?? "",
    t.branch ?? "",
    Array.isArray(t.specialties) ? t.specialties.join(",") : "",
    t.rating ?? 0,
    t.commissionRate ?? 0,
    t.totalCommissionEarned ?? 0,
    t.status ?? "active",
    t.monthlyTarget ?? 0,
    t.currentSales ?? 0,
    t.baseSalary ?? 0,
    t.linkedUserId ?? "",
  ];
}
