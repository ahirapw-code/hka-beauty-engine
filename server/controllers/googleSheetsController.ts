import { Request, Response } from "express";
import { verifyUserToken } from "../middleware/auth.js";
import User from "../models/User.js";
import Therapist from "../models/Therapist.js";
import Setting from "../models/Setting.js";
import PayrollAuditLog from "../models/PayrollAuditLog.js";

/**
 * Parses commissionRate/baseSalary changes out of one sheet row and returns
 * what changed, without writing anything - shared by the Therapists and
 * Managers tabs below so both get identical validation/audit behavior.
 */
function diffRateAndSalary(
  row: any[],
  commissionRateIndex: number,
  baseSalaryIndex: number,
  currentCommissionRate: number | undefined,
  currentBaseSalary: number | undefined,
  staffLabel: string,
  warnings: string[]
): { commissionRate?: number; baseSalary?: number } {
  const changes: { commissionRate?: number; baseSalary?: number } = {};

  if (commissionRateIndex !== -1 && commissionRateIndex < row.length) {
    const rawComm = row[commissionRateIndex];
    if (rawComm !== undefined && rawComm !== null && String(rawComm).trim() !== "") {
      const parsedComm = Number(rawComm);
      const currentComm = currentCommissionRate !== undefined ? Number(currentCommissionRate) : null;
      if (parsedComm !== currentComm) {
        if (isNaN(parsedComm) || parsedComm < 0 || parsedComm > 1) {
          warnings.push(
            `Baris ${staffLabel} di Sheet memiliki nilai commissionRate tidak valid (${rawComm}) dan diabaikan`
          );
        } else {
          changes.commissionRate = parsedComm;
        }
      }
    }
  }

  if (baseSalaryIndex !== -1 && baseSalaryIndex < row.length) {
    const rawSalary = row[baseSalaryIndex];
    if (rawSalary !== undefined && rawSalary !== null && String(rawSalary).trim() !== "") {
      const parsedSalary = Number(rawSalary);
      const currentSalary = currentBaseSalary !== undefined ? Number(currentBaseSalary) : null;
      if (parsedSalary !== currentSalary) {
        if (isNaN(parsedSalary) || parsedSalary < 0) {
          warnings.push(
            `Baris ${staffLabel} di Sheet memiliki nilai baseSalary tidak valid (${rawSalary}) dan diabaikan`
          );
        } else {
          changes.baseSalary = parsedSalary;
        }
      }
    }
  }

  return changes;
}

/**
 * POST /api/syncSheetsToFirestore
 * Endpoint path kept unchanged for frontend compatibility even though the
 * datastore is now MongoDB. Direct Mongoose port of the original logic.
 *
 * Reads two tabs:
 *  - "Therapists" -> updates Therapist.commissionRate / .baseSalary
 *  - "Managers"   -> updates User.commissionRate / .baseSalary, but ONLY for
 *    documents whose role is already SALON_MANAGER (a row that doesn't
 *    match an existing Salon Manager account - wrong id, therapist id
 *    reused by mistake, etc - is skipped with a warning instead of
 *    silently touching the wrong user).
 * Both are payroll-sensitive fields, so both go through this same
 * HKA_MANAGEMENT-only, audited, one-way (sheet -> DB) path rather than the
 * generic bidirectional Sheets sync - identical reasoning for each: comp
 * data must never be silently overwritten by an unrelated Sheets edit.
 */
export async function syncSheetsToFirestore(req: Request, res: Response) {
  try {
    const { spreadsheetId, accessToken, appsScriptUrl } = req.body;
    if (!spreadsheetId) {
      return res.status(400).json({ error: "Missing required spreadsheetId parameter." });
    }

    const authHeader = req.headers.authorization;
    const caller = await verifyUserToken(authHeader);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
    }

    const userData = await User.findById(caller.uid);
    if (!userData || userData.role !== "HKA_MANAGEMENT") {
      return res.status(403).json({
        error: "Forbidden: Hanya HKA_MANAGEMENT yang diizinkan melakukan sinkronisasi payroll dari Google Sheets.",
      });
    }

    // Fetch both tabs. Missing "Managers" is expected/normal for
    // spreadsheets that haven't added it yet - that's a warning, not a
    // hard failure, so Therapists sync keeps working either way.
    let therapistRows: any[][] = [];
    let managerRows: any[][] = [];
    const warnings: string[] = [];

    if (appsScriptUrl) {
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
        throw new Error(json.message || "Apps Script failed to read");
      }
      therapistRows = json.data?.["Therapists"] || [];
      managerRows = json.data?.["Managers"] || [];
      if (managerRows.length === 0) {
        warnings.push('Tab "Managers" tidak ditemukan atau kosong di Google Sheets - dilewati.');
      }
    } else {
      if (!accessToken) {
        return res.status(400).json({ error: "Missing Google access token." });
      }
      const therapistRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Therapists!A1:K`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!therapistRes.ok) {
        throw new Error(`Sheets API fetch failed with status ${therapistRes.status}`);
      }
      const therapistJson: any = await therapistRes.json();
      therapistRows = therapistJson.values || [];

      // "Managers" is a newer, optional tab - a 400 here (tab doesn't
      // exist yet) is tolerated and just skips manager payroll sync for
      // this run, instead of failing the whole request.
      const managerRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Managers!A1:F`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (managerRes.ok) {
        const managerJson: any = await managerRes.json();
        managerRows = managerJson.values || [];
      } else {
        warnings.push('Tab "Managers" belum ditemukan di Google Sheets - dilewati. Tambahkan tab ini untuk sinkronisasi gaji/komisi Salon Manager.');
      }
    }

    const syncTimestamp = new Date().toISOString();

    // --- Therapists tab -------------------------------------------------
    if (therapistRows.length > 0) {
      const headers = therapistRows[0];
      const idIndex = headers.indexOf("id");
      const commissionRateIndex = headers.indexOf("commissionRate");
      const baseSalaryIndex = headers.indexOf("baseSalary");

      if (idIndex === -1) {
        warnings.push("Kolom 'id' tidak ditemukan di tab Therapists pada Google Sheets - tab ini dilewati.");
      } else {
        for (const row of therapistRows.slice(1)) {
          const therapistId = row[idIndex];
          if (!therapistId) continue;

          const fsData = await Therapist.findById(therapistId);
          if (!fsData) continue; // Skip if therapist doesn't exist

          const changes = diffRateAndSalary(
            row,
            commissionRateIndex,
            baseSalaryIndex,
            fsData.commissionRate,
            fsData.baseSalary,
            `therapist ${fsData.name || therapistId}`,
            warnings
          );

          if (changes.commissionRate === undefined && changes.baseSalary === undefined) continue;

          const auditLogsToWrite: any[] = [];
          if (changes.commissionRate !== undefined) {
            auditLogsToWrite.push({
              therapistId,
              staffType: "therapist",
              field: "commissionRate",
              oldValue: fsData.commissionRate ?? null,
              newValue: changes.commissionRate,
              source: "google_sheets_sync",
              timestamp: syncTimestamp,
            });
          }
          if (changes.baseSalary !== undefined) {
            auditLogsToWrite.push({
              therapistId,
              staffType: "therapist",
              field: "baseSalary",
              oldValue: fsData.baseSalary ?? null,
              newValue: changes.baseSalary,
              source: "google_sheets_sync",
              timestamp: syncTimestamp,
            });
          }

          await Therapist.updateOne({ _id: therapistId }, { $set: changes });
          if (auditLogsToWrite.length > 0) {
            await PayrollAuditLog.insertMany(auditLogsToWrite);
          }
        }
      }
    }

    // --- Managers tab -----------------------------------------------------
    if (managerRows.length > 0) {
      const headers = managerRows[0];
      const idIndex = headers.indexOf("id");
      const commissionRateIndex = headers.indexOf("commissionRate");
      const baseSalaryIndex = headers.indexOf("baseSalary");

      if (idIndex === -1) {
        warnings.push("Kolom 'id' tidak ditemukan di tab Managers pada Google Sheets - tab ini dilewati.");
      } else {
        for (const row of managerRows.slice(1)) {
          const managerId = row[idIndex];
          if (!managerId) continue;

          const userDoc = await User.findById(managerId);
          if (!userDoc) {
            warnings.push(`Baris Managers dengan id "${managerId}" tidak ditemukan sebagai akun - dilewati.`);
            continue;
          }
          // Safety: this row must belong to an actual Salon Manager
          // account. Refusing to touch any other role means a stray/wrong
          // id in this tab can never accidentally rewrite a Therapist's or
          // an HKA_MANAGEMENT account's pay data.
          if (userDoc.role !== "SALON_MANAGER") {
            warnings.push(
              `Baris Managers dengan id "${managerId}" bukan akun Salon Manager (role saat ini: ${userDoc.role}) - dilewati.`
            );
            continue;
          }

          const changes = diffRateAndSalary(
            row,
            commissionRateIndex,
            baseSalaryIndex,
            userDoc.commissionRate,
            userDoc.baseSalary,
            `manager ${userDoc.name || managerId}`,
            warnings
          );

          if (changes.commissionRate === undefined && changes.baseSalary === undefined) continue;

          const auditLogsToWrite: any[] = [];
          if (changes.commissionRate !== undefined) {
            auditLogsToWrite.push({
              therapistId: managerId,
              staffType: "manager",
              field: "commissionRate",
              oldValue: userDoc.commissionRate ?? null,
              newValue: changes.commissionRate,
              source: "google_sheets_sync",
              timestamp: syncTimestamp,
            });
          }
          if (changes.baseSalary !== undefined) {
            auditLogsToWrite.push({
              therapistId: managerId,
              staffType: "manager",
              field: "baseSalary",
              oldValue: userDoc.baseSalary ?? null,
              newValue: changes.baseSalary,
              source: "google_sheets_sync",
              timestamp: syncTimestamp,
            });
          }

          await User.updateOne({ _id: managerId }, { $set: changes });
          if (auditLogsToWrite.length > 0) {
            await PayrollAuditLog.insertMany(auditLogsToWrite);
          }
        }
      }
    }

    // Update lastPayrollSync in settings/sheets_config (merge semantics)
    await Setting.findByIdAndUpdate(
      "sheets_config",
      { $set: { lastPayrollSync: syncTimestamp } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      warnings,
      lastPayrollSync: syncTimestamp,
    });
  } catch (err: any) {
    console.error("Error in syncSheetsToFirestore:", err);
    return res.status(500).json({ error: err.message || "Error during Sheets to Firestore sync." });
  }
}
