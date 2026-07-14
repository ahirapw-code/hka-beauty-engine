import { Request, Response } from "express";
import { verifyUserToken } from "../middleware/auth";
import User from "../models/User";
import Therapist from "../models/Therapist";
import Setting from "../models/Setting";
import PayrollAuditLog from "../models/PayrollAuditLog";

/**
 * POST /api/syncSheetsToFirestore
 * Endpoint path kept unchanged for frontend compatibility even though the
 * datastore is now MongoDB. Direct Mongoose port of the original logic.
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

    let rows: any[][] = [];
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
      rows = json.data?.["Therapists"] || [];
    } else {
      if (!accessToken) {
        return res.status(400).json({ error: "Missing Google access token." });
      }
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Therapists!A1:K`;
      const fetchRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!fetchRes.ok) {
        throw new Error(`Sheets API fetch failed with status ${fetchRes.status}`);
      }
      const json: any = await fetchRes.json();
      rows = json.values || [];
    }

    if (rows.length === 0) {
      return res.status(200).json({ success: true, warnings: [], lastPayrollSync: new Date().toISOString() });
    }

    const headers = rows[0];
    const idIndex = headers.indexOf("id");
    const commissionRateIndex = headers.indexOf("commissionRate");
    const baseSalaryIndex = headers.indexOf("baseSalary");

    if (idIndex === -1) {
      return res.status(400).json({ error: "Kolom 'id' tidak ditemukan di tab Therapists pada Google Sheets." });
    }

    const therapistsToProcess = rows.slice(1);
    const warnings: string[] = [];
    const syncTimestamp = new Date().toISOString();

    for (const row of therapistsToProcess) {
      const therapistId = row[idIndex];
      if (!therapistId) continue;

      const fsData = await Therapist.findById(therapistId);
      if (!fsData) continue; // Skip if therapist doesn't exist

      const therapistName = fsData.name || therapistId;

      let commissionRateChanged = false;
      let newCommissionRateValue: number | null = null;
      if (commissionRateIndex !== -1 && commissionRateIndex < row.length) {
        const rawComm = row[commissionRateIndex];
        if (rawComm !== undefined && rawComm !== null && String(rawComm).trim() !== "") {
          const parsedComm = Number(rawComm);
          const currentComm = fsData.commissionRate !== undefined ? Number(fsData.commissionRate) : null;
          if (parsedComm !== currentComm) {
            if (isNaN(parsedComm) || parsedComm < 0 || parsedComm > 1) {
              warnings.push(
                `Baris therapist ${therapistName} di Sheet memiliki nilai commissionRate tidak valid (${rawComm}) dan diabaikan`
              );
            } else {
              commissionRateChanged = true;
              newCommissionRateValue = parsedComm;
            }
          }
        }
      }

      let baseSalaryChanged = false;
      let newBaseSalaryValue: number | null = null;
      if (baseSalaryIndex !== -1 && baseSalaryIndex < row.length) {
        const rawSalary = row[baseSalaryIndex];
        if (rawSalary !== undefined && rawSalary !== null && String(rawSalary).trim() !== "") {
          const parsedSalary = Number(rawSalary);
          const currentSalary = fsData.baseSalary !== undefined ? Number(fsData.baseSalary) : null;
          if (parsedSalary !== currentSalary) {
            if (isNaN(parsedSalary) || parsedSalary < 0) {
              warnings.push(
                `Baris therapist ${therapistName} di Sheet memiliki nilai baseSalary tidak valid (${rawSalary}) dan diabaikan`
              );
            } else {
              baseSalaryChanged = true;
              newBaseSalaryValue = parsedSalary;
            }
          }
        }
      }

      if (commissionRateChanged || baseSalaryChanged) {
        const updateData: any = {};
        const auditLogsToWrite: any[] = [];

        if (commissionRateChanged && newCommissionRateValue !== null) {
          updateData.commissionRate = newCommissionRateValue;
          auditLogsToWrite.push({
            therapistId,
            field: "commissionRate",
            oldValue: fsData.commissionRate !== undefined ? fsData.commissionRate : null,
            newValue: newCommissionRateValue,
            source: "google_sheets_sync",
            timestamp: syncTimestamp,
          });
        }

        if (baseSalaryChanged && newBaseSalaryValue !== null) {
          updateData.baseSalary = newBaseSalaryValue;
          auditLogsToWrite.push({
            therapistId,
            field: "baseSalary",
            oldValue: fsData.baseSalary !== undefined ? fsData.baseSalary : null,
            newValue: newBaseSalaryValue,
            source: "google_sheets_sync",
            timestamp: syncTimestamp,
          });
        }

        // Update therapist
        await Therapist.updateOne({ _id: therapistId }, { $set: updateData });

        // Write audit logs
        if (auditLogsToWrite.length > 0) {
          await PayrollAuditLog.insertMany(auditLogsToWrite);
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
