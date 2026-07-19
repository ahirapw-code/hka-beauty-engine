import { useState, useEffect, useRef } from 'react';
import { 
  googleSignIn, 
  googleSignOut, 
  findOrCreateDatabase, 
  syncStateToSpreadsheetIncremental,
  appendManagerStubRow,
  initAuth
} from '../lib/googleSheets';
import { Customer, Booking, Transaction, Therapist, Product, Service, Expense, Attendance, User } from '../types';
import { 
  Database, 
  CloudLightning, 
  RefreshCw, 
  AlertTriangle, 
  ExternalLink, 
  LogOut, 
  ChevronDown,
  Copy,
  Check,
  Lock,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, setDoc } from '../lib/firestoreClient';
import { db, auth } from '../lib/firebase';
import { persistSheetsSyncToServer, fetchSheetsSyncBaseline, saveSheetsSyncBaseline } from '../lib/sheetsPersist';
import { notifyUnauthorized } from '../lib/authClient';

interface GoogleSheetsSyncProps {
  customers: Customer[];
  bookings: Booking[];
  transactions: Transaction[];
  therapists: Therapist[];
  products: Product[];
  services: Service[];
  expenses: Expense[];
  attendance: Attendance[];
  users: User[];
  onDataLoaded: (data: {
    customers: Customer[];
    bookings: Booking[];
    transactions: Transaction[];
    therapists: Therapist[];
    products: Product[];
    services: Service[];
    expenses: Expense[];
    attendance: Attendance[];
    users: User[];
  }) => void;
  currentUser: User | null;
  /** True once every collection has loaded real data from MongoDB at least
   * once. Auto-sync must wait for this. */
  dataReady: boolean;
}

const APPS_SCRIPT_CODE = `// Google Apps Script Web App Code
// Deploy as Web App, executing as "Me" (your Google account) and allowing access to "Anyone".
// This version auto-creates every tab & header row your HKA Engine app expects.

var SHEET_SCHEMAS = {
  'Customers':   ['id','name','email','phone','totalSpend','visitsCount','lastVisit','notes','preferredBranch','isMember','memberSince'],
  'Bookings':    ['id','customerName','customerPhone','serviceId','serviceName','therapistId','therapistName','branch','date','time','duration','price','status','notes'],
  'Transactions':['id','date','customerName','branch','subtotal','discount','total','paymentMethod','cashierName','items_json'],
  'Therapists':  ['id','name','branch','specialties','rating','commissionRate','totalCommissionEarned','status','monthlyTarget','currentSales','baseSalary','linkedUserId'],
  'Products':    ['id','name','sku','price','cost','stock','minStock','branch','category'],
  'Expenses':    ['id','branch','category','amount','date','description'],
  'Attendance':  ['id','userId','userName','role','branch','date','clockIn','clockOut','status','notes'],
  'Users':       ['id','username','name','role','branch','email','avatar'],
  // Payroll-rate tab for Salon Managers, mirrors the commissionRate/
  // baseSalary/monthlyTarget columns on 'Therapists' - see
  // MANAGERS_SHEET_HEADERS in src/lib/googleSheets.ts for the full
  // rationale. Only 'id', 'name' (reference only), 'branch',
  // 'commissionRate', 'baseSalary', 'status' and 'monthlyTarget' matter;
  // nothing else about the manager account is read from or written to
  // this tab.
  'Managers':    ['id','name','branch','commissionRate','baseSalary','status','monthlyTarget']
};

function ensureSheets(ss) {
  var names = Object.keys(SHEET_SCHEMAS);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var headers = SHEET_SCHEMAS[name];
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    // Force the whole data area to Plain Text. Without this, Sheets
    // auto-detects strings like "17:00:00" or "2026-07-11 17:00:00" and
    // silently converts the cell to a Date/Time type - which then reads
    // back as a JS Date anchored at Sheets' 1899-12-30 epoch instead of
    // the original text, breaking every subsequent sync comparison.
    sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 1000), headers.length).setNumberFormat('@');
    if (sheet.getLastRow() === 0) {
      var range = sheet.getRange(1, 1, 1, headers.length);
      range.setValues([headers]);
      range.setFontWeight('bold').setBackground('#f1f3f4');
      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, headers.length);
    } else {
      // Existing tab (e.g. "Therapists" before linkedUserId existed, or
      // "Managers" before monthlyTarget existed) - extend the header row in
      // place if the schema above has grown new trailing columns, instead
      // of only writing headers on brand new sheets. Existing data rows are
      // left untouched.
      var existingHeaderRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
      var existingHeaders = existingHeaderRange.getValues()[0];
      if (existingHeaders.length < headers.length) {
        var newRange = sheet.getRange(1, 1, 1, headers.length);
        newRange.setValues([headers]);
        newRange.setFontWeight('bold').setBackground('#f1f3f4');
        sheet.autoResizeColumns(1, headers.length);
      }
    }
  }
  // Clean up the default blank "Sheet1" Google gives every new spreadsheet
  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
}

// Converts any cell Sheets has already auto-converted to a Date object back
// into plain text, using the same "yyyy-MM-dd HH:mm:ss" shape the app
// writes, instead of letting JSON.stringify serialize it as an ISO string
// anchored at the Sheets Date/Time epoch (1899-12-30).
function normalizeRow(row) {
  return row.map(function (cell) {
    if (Object.prototype.toString.call(cell) === '[object Date]') {
      return Utilities.formatDate(cell, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    }
    return cell;
  });
}

// Visit YOUR_WEB_APP_URL?spreadsheetId=YOUR_ID in a browser any time to
// (re)create all tabs/headers without needing the app to trigger a sync.
function doGet(e) {
  var spreadsheetId = e.parameter.spreadsheetId;
  if (!spreadsheetId) {
    return ContentService.createTextOutput('Missing ?spreadsheetId=... in the URL.');
  }
  var ss = SpreadsheetApp.openById(spreadsheetId);
  ensureSheets(ss);
  return ContentService.createTextOutput('OK - all HKA Engine sheets are set up in "' + ss.getName() + '".');
}

function doPost(e) {
  var params = JSON.parse(e.postData.contents);
  var action = params.action;
  var spreadsheetId = params.spreadsheetId;

  var ss = SpreadsheetApp.openById(spreadsheetId);
  ensureSheets(ss);

  if (action === 'read') {
    var result = {};
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var name = sheet.getName();
      if (!SHEET_SCHEMAS[name]) continue;
      var rawRows = sheet.getDataRange().getValues();
      result[name] = rawRows.map(normalizeRow);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'write_incremental') {
    var updates = params.updates;
    for (var i = 0; i < updates.length; i++) {
      var u = updates[i];
      var sheet = ss.getSheetByName(u.sheet);
      if (!sheet) continue;
      var rowMatch = u.range.match(/\\d+/);
      if (rowMatch) {
        var rowNum = parseInt(rowMatch[0], 10);
        var range = sheet.getRange(rowNum, 1, u.values.length, u.values[0].length);
        // Re-assert plain text on the exact cells being written - the
        // sheet-wide pass in ensureSheets covers pre-existing rows, but a
        // brand new row appended here needs it applied before setValues
        // too, otherwise Sheets re-detects the type as it's written.
        range.setNumberFormat('@');
        range.setValues(u.values);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action: ' + action }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

export default function GoogleSheetsSync({
  customers,
  bookings,
  transactions,
  therapists,
  products,
  services,
  expenses,
  attendance,
  users,
  onDataLoaded,
  currentUser,
  dataReady
}: GoogleSheetsSyncProps) {
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  
  // Settings synced from Firestore settings/sheets_config
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(() => {
    return localStorage.getItem('hka_sheets_spreadsheet_id');
  });
  const [appsScriptUrl, setAppsScriptUrl] = useState<string | null>(() => {
    return localStorage.getItem('hka_sheets_apps_script_url');
  });

  const [syncStatus, setSyncStatus] = useState<'idle' | 'connecting' | 'connected' | 'syncing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictLogs, setConflictLogs] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(() => {
    return localStorage.getItem('hka_sheets_last_synced');
  });
  const [lastPayrollSync, setLastPayrollSync] = useState<string | null>(() => {
    return localStorage.getItem('hka_sheets_last_payroll_sync');
  });
  const [autoSync, setAutoSync] = useState<boolean>(() => {
    return localStorage.getItem('hka_sheets_auto_sync') !== 'false';
  });

  const [urlInput, setUrlInput] = useState(appsScriptUrl || '');
  const [isCopied, setIsCopied] = useState(false);
  const [isSavingUrl, setIsSavingUrl] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState(spreadsheetId || '');
  const [isSavingSpreadsheetId, setIsSavingSpreadsheetId] = useState(false);

  const isHQManagement = currentUser?.role === 'HKA_MANAGEMENT';
  const isSyncingRef = useRef(false);
  // True when the most recent sync read/merged the Sheet fine but could
  // NOT save the result to the database because the logged-in role isn't
  // allowed to (see canPersist below - by design for THERAPIST accounts).
  // Surfaced as a calm, honest status instead of silently showing
  // "success" for a sync that didn't actually persist anything.
  const [persistBlockedForRole, setPersistBlockedForRole] = useState(false);

  // Always-fresh snapshot of the data props, read by handleIncrementalSync
  // at call time, so the scheduling effect below doesn't need to restart
  // (and re-fire an immediate sync) every time a business record changes.
  const latestDataRef = useRef({ customers, bookings, transactions, therapists, products, services, expenses, attendance, users });
  useEffect(() => {
    latestDataRef.current = { customers, bookings, transactions, therapists, products, services, expenses, attendance, users };
  }, [customers, bookings, transactions, therapists, products, services, expenses, attendance, users]);

  // 1. Listen to shared spreadsheet and Apps Script config from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'sheets_config'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.spreadsheetId) {
          setSpreadsheetId(data.spreadsheetId);
          localStorage.setItem('hka_sheets_spreadsheet_id', data.spreadsheetId);
        }
        if (data.appsScriptUrl) {
          setAppsScriptUrl(data.appsScriptUrl);
          setUrlInput(data.appsScriptUrl);
          localStorage.setItem('hka_sheets_apps_script_url', data.appsScriptUrl);
        }
        if (data.lastPayrollSync) {
          setLastPayrollSync(data.lastPayrollSync);
          localStorage.setItem('hka_sheets_last_payroll_sync', data.lastPayrollSync);
        }
      }
    });
    return () => unsub();
  }, []);

  // 2. Listen to Firebase Google Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (userAuth, accessToken) => {
        setGoogleUser(userAuth);
        setToken(accessToken);
        setSessionExpired(false);
        if (syncStatus === 'idle') setSyncStatus('connected');
      },
      () => {
        setGoogleUser(null);
        setToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // 3. Bidirectional Incremental Sync logic
  const handleIncrementalSync = async (isBackground = false) => {
    if (isSyncingRef.current) return;
    if (!spreadsheetId) {
      if (!isBackground) {
        setErrorMessage('Spreadsheet ID belum terhubung. Silakan hubungkan spreadsheet terlebih dahulu.');
      }
      return;
    }
    if (!token && !appsScriptUrl) {
      if (!isBackground) {
        setErrorMessage('Sesi Google Sheets atau URL Apps Script belum terkonfigurasi.');
      }
      return;
    }
    if (!dataReady) {
      if (!isBackground) {
        setErrorMessage('Data lokal belum selesai dimuat dari database. Coba lagi sesaat.');
      }
      return;
    }

    isSyncingRef.current = true;
    if (!isBackground) {
      setSyncStatus('syncing');
      setErrorMessage(null);
    }

    try {
      // Fetch the server-shared baseline (see fetchSheetsSyncBaseline,
      // src/lib/sheetsPersist.ts) rather than reading it out of this
      // browser's own localStorage - a per-browser baseline is what let a
      // deletion made via the Sheet get silently undone by some OTHER
      // open session's next auto-sync tick.
      const syncBaseline = await fetchSheetsSyncBaseline();

      const result = await syncStateToSpreadsheetIncremental(
        spreadsheetId,
        token,
        latestDataRef.current,
        appsScriptUrl,
        syncBaseline
      );

      // Apply updated, merged state
      onDataLoaded(result.updatedLocalData);
      setConflictLogs(result.conflictLog);
      
      const timeString = new Date().toLocaleTimeString();
      setLastSynced(timeString);
      localStorage.setItem('hka_sheets_last_synced', timeString);

      // Backfill: make sure every current SALON_MANAGER has a row in the
      // "Managers" payroll-rate tab. This tab is intentionally excluded
      // from the generic bidirectional engine above (see
      // MANAGERS_SHEET_HEADERS in src/lib/googleSheets.ts), so a manager
      // account promoted before this stub-row logic existed - or whose
      // one-off write at registration/promotion time failed - would
      // otherwise be stuck with no row to ever set commissionRate/
      // baseSalary from, with no way to notice short of opening the sheet.
      // appendManagerStubRow is idempotent (skips ids that already have a
      // row), so it's safe to run this against every SALON_MANAGER on
      // every sync. Restricted to HKA_MANAGEMENT, matching who's allowed
      // to actually run the payroll-sensitive Sheets->DB sync.
      if (isHQManagement) {
        const currentManagers = latestDataRef.current.users.filter(u => u.role === 'SALON_MANAGER');
        for (const manager of currentManagers) {
          try {
            await appendManagerStubRow(spreadsheetId, token, appsScriptUrl, {
              id: manager.id,
              name: manager.name,
              branch: manager.branch,
            });
          } catch (managerBackfillErr: any) {
            console.error(`Failed to backfill Managers sheet row for ${manager.name}: `, managerBackfillErr);
            setConflictLogs(prev => [
              ...prev,
              `Gagal menambahkan baris tab Managers untuk ${manager.name}: ${managerBackfillErr.message || managerBackfillErr}`,
            ]);
          }
        }
      }

      // Persist the reconciled dataset to MongoDB. Without this, the merge
      // above only lives in React state - a refresh (or anyone else's
      // session) would keep seeing whatever was already in the database.
      //
      // This is deliberately NOT swallowed into just the conflict log
      // anymore. A failure here means the Sheet edit the person just made
      // (e.g. flipping isMember/memberSince) only ever existed in this
      // browser's React state for a few seconds - the very next 4s
      // onSnapshot poll (src/lib/firestoreClient.ts) overwrites it with
      // whatever Mongo still has, and it looks like the change "reverted
      // itself" with zero visible error. Surfacing it as a hard error
      // (red banner + failed sync status) instead of a buried log line
      // makes that failure impossible to miss.
      // Persist is only ever expected to succeed for HKA_MANAGEMENT/
      // SALON_MANAGER (server-side check in sheetsPersistController.ts).
      // A 403 for any other role is by design, not a bug - don't alarm a
      // cashier/therapist's session over it. For a role that SHOULD be
      // allowed to persist, though, a failure here is exactly the "edit
      // vanishes after refresh" bug, so make it loud.
      const canPersist = currentUser?.role === 'HKA_MANAGEMENT' || currentUser?.role === 'SALON_MANAGER';
      let persistFailed = false;
      setPersistBlockedForRole(false);
      try {
        await persistSheetsSyncToServer(result.updatedLocalData, result.deletedIds);
      } catch (persistErr: any) {
        console.error('Error persisting Sheets sync to database:', persistErr);
        const msg = persistErr?.message || String(persistErr);
        setConflictLogs(prev => [
          ...prev,
          `Gagal menyimpan hasil sync ke database: ${msg}`,
        ]);
        if (canPersist) {
          persistFailed = true;
          setErrorMessage(
            `Perubahan dari Sheet berhasil dibaca, TAPI GAGAL disimpan ke database (${msg}). ` +
            `Perubahan ini akan hilang lagi saat halaman di-refresh. Coba "Sinkronisasikan Sekarang" lagi.`
          );
        } else {
          // Expected for THERAPIST accounts - they can read the latest
          // Sheet data, but only management can write the reconciled
          // result back to the database. This used to be swallowed
          // entirely, which meant the UI showed a plain green "success"
          // for a sync that silently saved nothing - indistinguishable
          // from a real, fully-successful sync. Surface it honestly (but
          // calmly, not as a scary red error) instead.
          setPersistBlockedForRole(true);
        }
      }

      if (!persistFailed) {
        // Advance the shared baseline only now that the reconciled data (and
        // any deletions) are durably in MongoDB. If persist had failed, the
        // OLD baseline is left in place so the next sync run - on this
        // device or any other - re-derives the same reconciliation instead
        // of a deletion "confirming" here without ever having happened in
        // the database.
        try {
          await saveSheetsSyncBaseline(result.newSyncBaseline);
        } catch (baselineErr) {
          console.error('Error saving Sheets sync baseline:', baselineErr);
        }
      }

      // Trigger backend payroll (salary and commission rate) sync from Sheets to Firestore
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (idToken) {
          const syncRes = await fetch("/api/syncSheetsToFirestore", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({
              spreadsheetId,
              accessToken: token,
              appsScriptUrl
            })
          });

          if (syncRes.ok) {
            const syncJson = await syncRes.json();
            if (syncJson.success) {
              if (syncJson.lastPayrollSync) {
                setLastPayrollSync(syncJson.lastPayrollSync);
                localStorage.setItem('hka_sheets_last_payroll_sync', syncJson.lastPayrollSync);
              }
              if (syncJson.warnings && syncJson.warnings.length > 0) {
                setConflictLogs(prev => [...prev, ...syncJson.warnings]);
              }
            }
          } else if (syncRes.status === 401) {
            // Dead token - same handling as every other authenticated call
            // (src/lib/firestoreClient.ts, src/lib/sheetsPersist.ts). Left
            // unhandled here, this call would just keep quietly failing
            // (only logged to console) on every 30s auto-sync tick without
            // ever telling the person their session needs a fresh login.
            notifyUnauthorized();
            console.error("Backend payroll sync failed: session expired.");
          } else {
            console.error("Backend payroll sync failed");
          }
        }
      } catch (payrollErr) {
        console.error("Error triggering backend payroll sync:", payrollErr);
      }
      
      if (persistFailed) {
        // Keep the sync marked as an error state so the amber/rose pill and
        // the error banner stay visible instead of flashing green
        // "success" for a sync whose DB write actually failed.
        setSyncStatus('error');
      } else {
        setSyncStatus('success');
        setTimeout(() => setSyncStatus(googleUser || appsScriptUrl ? 'connected' : 'idle'), 4000);
      }
      setSessionExpired(false);
    } catch (error: any) {
      console.error('Incremental Sync error:', error);
      if (error.message === 'SESSION_EXPIRED') {
        setSessionExpired(true);
        setSyncStatus('error');
        setErrorMessage('Sesi Google Sheets berakhir, silakan hubungkan ulang.');
      } else {
        setSyncStatus('error');
        setErrorMessage(error.message || 'Sinkronisasi gagal dilakukan.');
      }
    } finally {
      isSyncingRef.current = false;
    }
  };

  // 4. Automated periodic sync running every 30 seconds
  useEffect(() => {
    const canSync = spreadsheetId && (token || appsScriptUrl) && dataReady;
    if (!canSync || !autoSync) return;

    // Run once on load/mount/role change
    handleIncrementalSync(true);

    const interval = setInterval(() => {
      handleIncrementalSync(true);
    }, 30000);

    return () => clearInterval(interval);
    // Deliberately not depending on customers/bookings/etc - each scheduled
    // run reads fresh data via latestDataRef at call time. Depending on
    // those arrays here caused this effect to tear down and re-fire an
    // immediate sync every single time any record changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadsheetId, token, appsScriptUrl, autoSync, dataReady]);

  // Google Authentication popup
  const handleLogin = async () => {
    setSyncStatus('connecting');
    setErrorMessage(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setToken(result.accessToken);
        setSyncStatus('connected');
        setSessionExpired(false);

        // Auto initialize / find spreadsheet
        await handleInitializeSpreadsheet(result.accessToken);
      }
    } catch (error: any) {
      console.error(error);
      setSyncStatus('error');
      const raw = error?.message || String(error);
      setErrorMessage(
        raw && raw !== 'undefined'
          ? `Login Google gagal: ${raw}`
          : 'Login Google dibatalkan atau gagal.'
      );
    }
  };

  const handleLogout = async () => {
    try {
      await googleSignOut();
      setGoogleUser(null);
      setToken(null);
      setSyncStatus('idle');
    } catch (err) {
      console.error(err);
    }
  };

  // Create spreadsheet structure and write initial data
  const handleInitializeSpreadsheet = async (accessToken: string) => {
    setSyncStatus('syncing');
    try {
      const id = await findOrCreateDatabase(accessToken, {
        customers, bookings, transactions, therapists, products, services, expenses, attendance, users
      });
      setSpreadsheetId(id);
      localStorage.setItem('hka_sheets_spreadsheet_id', id);

      // Save spreadsheet ID globally to Firestore so all staff can sync
      await setDoc(doc(db, 'settings', 'sheets_config'), {
        spreadsheetId: id
      }, { merge: true });

      setSyncStatus('connected');
      const timeString = new Date().toLocaleTimeString();
      setLastSynced(timeString);
      localStorage.setItem('hka_sheets_last_synced', timeString);
    } catch (error: any) {
      console.error(error);
      setSyncStatus('error');
      setErrorMessage('Inisialisasi Spreadsheet gagal: ' + error.message);
    }
  };

  // Save Apps Script Web App URL to Firestore
  const handleSaveAppsScriptUrl = async () => {
    setIsSavingUrl(true);
    try {
      await setDoc(doc(db, 'settings', 'sheets_config'), {
        appsScriptUrl: urlInput.trim()
      }, { merge: true });
      
      setAppsScriptUrl(urlInput.trim());
      localStorage.setItem('hka_sheets_apps_script_url', urlInput.trim());
    } catch (error: any) {
      console.error(error);
      setErrorMessage('Gagal menyimpan URL Apps Script ke Firestore.');
    } finally {
      setIsSavingUrl(false);
    }
  };

  // Save a manually-created Spreadsheet ID (no Google Sign-In / Cloud Console needed)
  const handleSaveSpreadsheetId = async () => {
    const id = spreadsheetIdInput.trim();
    if (!id) return;
    setIsSavingSpreadsheetId(true);
    try {
      await setDoc(doc(db, 'settings', 'sheets_config'), {
        spreadsheetId: id
      }, { merge: true });

      setSpreadsheetId(id);
      localStorage.setItem('hka_sheets_spreadsheet_id', id);
    } catch (error: any) {
      console.error(error);
      setErrorMessage('Gagal menyimpan Spreadsheet ID.');
    } finally {
      setIsSavingSpreadsheetId(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const toggleAutoSync = () => {
    const nextVal = !autoSync;
    setAutoSync(nextVal);
    localStorage.setItem('hka_sheets_auto_sync', String(nextVal));
  };

  // Status-pill coloring helper
  const getPillStyles = () => {
    if (sessionExpired) return 'bg-rose-50/70 border-rose-100 text-rose-800 hover:bg-rose-100/50';
    if (syncStatus === 'syncing') return 'bg-amber-50/70 border-amber-100 text-amber-800 hover:bg-amber-100/50';
    if (appsScriptUrl || googleUser) return 'bg-emerald-50/70 border-emerald-100 text-emerald-800 hover:bg-emerald-100/50';
    return 'bg-amber-50/70 border-amber-100 text-amber-800 hover:bg-amber-100/50';
  };

  return (
    <div id="google-sheets-sync-module" className="relative">
      {/* Trigger Pill */}
      <button
        id="sheets-sync-trigger"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-mono transition-all cursor-pointer ${getPillStyles()}`}
      >
        <CloudLightning className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin text-[#D4AF37]' : ''}`} />
        <span className="font-semibold">
          {sessionExpired ? 'Re-link Google' : (googleUser || appsScriptUrl) ? 'Sheets Linked' : 'Google Sheets Sync'}
        </span>
        {lastSynced && (
          <span className="text-[10px] opacity-60 hidden md:inline">
            • Synced {lastSynced}
          </span>
        )}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {/* Floating Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsOpen(false)} />

            <motion.div
              id="sheets-sync-dropdown"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute right-0 mt-2.5 w-[min(340px,calc(100vw-2rem))] bg-white rounded-2xl border border-slate-100 shadow-xl z-50 p-5 space-y-4 text-slate-800 max-h-[80vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#D4AF37]" />
                  <span className="font-serif font-bold text-sm">Sheets Cloud Database</span>
                </div>
                {isHQManagement && googleUser && (
                  <button
                    onClick={handleLogout}
                    className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
                    title="Disconnect Google"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Expired Session Block */}
              {sessionExpired && (
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl space-y-2 text-rose-800 text-xs">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    <span>Sesi Google Sheets Berakhir</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Token akses Anda telah kedaluwarsa. Silakan hubungkan ulang akun Google Anda untuk melanjutkan sinkronisasi langsung.
                  </p>
                  {isHQManagement && (
                    <button
                      onClick={handleLogin}
                      className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition-colors cursor-pointer text-center"
                    >
                      Hubungkan Ulang Google
                    </button>
                  )}
                </div>
              )}

              {/* HQ Management configuration panel */}
              {isHQManagement ? (
                <div className="space-y-4">
                  {!googleUser && !appsScriptUrl && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Inisialisasi Google Sheets sebagai database cloud eksternal. Lembar kerja (spreadsheet) bernama <strong>"HKA Salon Database"</strong> akan otomatis dideteksi atau dibuat baru di Google Drive Anda.
                      </p>
                      <button
                        onClick={handleLogin}
                        disabled={syncStatus === 'connecting'}
                        className="w-full flex justify-center items-center gap-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
                      >
                        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        </svg>
                        <span className="text-xs font-semibold text-slate-700">Hubungkan Akun Google</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <div className="h-px bg-slate-100 flex-1" />
                        <span className="text-[9px] text-slate-400 font-mono uppercase">atau, tanpa Google Cloud</span>
                        <div className="h-px bg-slate-100 flex-1" />
                      </div>

                      <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-xl p-3 space-y-2">
                        <span className="text-[10px] font-bold text-emerald-800 flex items-center gap-1 font-mono uppercase">
                          <Sparkles className="w-3 h-3 text-emerald-500" /> Setup Gratis (tanpa OAuth/Cloud Console):
                        </span>
                        <ol className="text-[9px] text-slate-600 space-y-1 list-decimal pl-3.5 leading-normal">
                          <li>Buka <strong>sheets.new</strong> untuk membuat spreadsheet kosong (gratis, akun Google biasa).</li>
                          <li>Salin ID dari URL-nya - bagian panjang di antara <span className="font-mono">/d/</span> dan <span className="font-mono">/edit</span>.</li>
                          <li>Tempel ID tersebut di bawah ini dan klik Save.</li>
                        </ol>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Spreadsheet ID"
                            value={spreadsheetIdInput}
                            onChange={(e) => setSpreadsheetIdInput(e.target.value)}
                            className="flex-1 text-[11px] font-mono px-3 py-1.5 border border-slate-200 rounded-xl focus:border-[#D4AF37] focus:outline-none bg-white"
                          />
                          <button
                            onClick={handleSaveSpreadsheetId}
                            disabled={isSavingSpreadsheetId || !spreadsheetIdInput.trim()}
                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl cursor-pointer transition-colors"
                          >
                            {isSavingSpreadsheetId ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400 leading-relaxed">
                          Setelah tersimpan, langkah berikutnya (setup Apps Script) akan muncul di bawah - juga tidak perlu Google Cloud Console.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Account display */}
                  {googleUser && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center gap-2.5">
                      {googleUser.photoURL ? (
                        <img src={googleUser.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-200" referralPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#D4AF37] text-white font-bold flex items-center justify-center text-xs">
                          {googleUser.displayName?.charAt(0) || googleUser.email?.charAt(0)}
                        </div>
                      )}
                      <div className="overflow-hidden">
                        <span className="text-xs font-bold text-slate-800 block truncate">{googleUser.displayName || 'HQ Authorized'}</span>
                        <span className="text-[10px] text-slate-400 block truncate font-mono">{googleUser.email}</span>
                      </div>
                    </div>
                  )}

                  {/* Connected Spreadsheet & Apps Script Configuration */}
                  {spreadsheetId && (
                    <div className="space-y-4 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-mono">Spreadsheet ID:</span>
                        <a
                          href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#D4AF37] hover:underline font-bold flex items-center gap-1 font-mono text-[10px]"
                        >
                          OPEN SHEET <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-mono">Status Terakhir:</span>
                        <span className="font-mono text-slate-700 font-bold">{lastSynced ? `Synced ${lastSynced}` : 'Belum Pernah'}</span>
                      </div>

                      {lastPayrollSync && (
                        <div className="text-[10px] text-amber-600 bg-amber-50/40 rounded-lg py-1.5 px-2.5 border border-amber-100/30 text-center font-mono leading-relaxed">
                          Terakhir sync gaji/komisi dari Sheets: {new Date(lastPayrollSync).toLocaleTimeString()}
                        </div>
                      )}

                      {/* Auto-Sync Toggle */}
                      <div className="flex justify-between items-center bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        <div>
                          <span className="text-xs font-bold text-slate-700 block">Sinkronisasi Otomatis</span>
                          <span className="text-[9px] text-slate-400 block">Sinkronisasi background periodik 30s</span>
                        </div>
                        <button
                          onClick={toggleAutoSync}
                          className={`w-9 h-5 rounded-full p-0.5 transition-all focus:outline-none cursor-pointer ${
                            autoSync ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white transition-all transform ${autoSync ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </div>

                      {/* Apps Script URL setup for all-staff sync */}
                      <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">Google Apps Script Web App</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal">
                          Gunakan Apps Script sebagai perantara agar seluruh staf (Kasir, Terapis, Branch Manager) dapat sinkronisasi otomatis tanpa harus login Google satu per satu.
                        </p>
                        
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="https://script.google.com/macros/s/.../exec"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            className="flex-1 text-[11px] font-mono px-3 py-1.5 border border-slate-200 rounded-xl focus:border-[#D4AF37] focus:outline-none bg-slate-50"
                          />
                          <button
                            onClick={handleSaveAppsScriptUrl}
                            disabled={isSavingUrl}
                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl cursor-pointer transition-colors"
                          >
                            {isSavingUrl ? 'Saving...' : 'Save'}
                          </button>
                        </div>

                        {/* Expandable Apps Script instructions */}
                        <div className="bg-emerald-50/50 border border-emerald-100/50 rounded-xl p-3 mt-2 space-y-2">
                          <span className="text-[10px] font-bold text-emerald-800 flex items-center gap-1 font-mono uppercase">
                            <Lock className="w-3 h-3 text-emerald-500" /> Cara Setup Google Apps Script:
                          </span>
                          <ol className="text-[9px] text-slate-600 space-y-1 list-decimal pl-3.5 leading-normal">
                            <li>Buka spreadsheet, klik menu <strong>Extensions &gt; Apps Script</strong>.</li>
                            <li>Hapus semua kode bawaan, lalu salin kode di bawah ini.</li>
                            <li>Klik tombol <strong>Deploy &gt; New Deployment</strong>.</li>
                            <li>Pilih type: <strong>Web App</strong>.</li>
                            <li>Execute as: <strong>Me (your Google account)</strong>.</li>
                            <li>Who has access: <strong>Anyone</strong>.</li>
                            <li>Deploy, beri izin akses, lalu tempel URL Web App ke input di atas.</li>
                          </ol>

                          <div className="flex items-center justify-between pt-1 border-t border-emerald-100/40">
                            <span className="text-[9px] text-emerald-800 font-bold font-mono">KODE APPS SCRIPT:</span>
                            <button
                              onClick={handleCopyCode}
                              className="text-[9px] font-bold text-[#D4AF37] hover:underline flex items-center gap-0.5 cursor-pointer"
                            >
                              {isCopied ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                              <span>{isCopied ? 'Tersalin' : 'Salin Kode'}</span>
                            </button>
                          </div>
                          <pre className="bg-slate-900 text-slate-200 text-[8px] p-2 rounded-lg overflow-x-auto font-mono max-h-32">
                            {APPS_SCRIPT_CODE}
                          </pre>
                        </div>
                      </div>

                      {/* Manual Sync Trigger */}
                      <button
                        onClick={() => handleIncrementalSync(false)}
                        disabled={syncStatus === 'syncing'}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Sinkronisasikan Sekarang</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // Non-HQ Staff view (Cashier, Therapist, Branch Manager)
                <div className="space-y-3.5">
                  <div className="flex items-center gap-2 p-2 bg-emerald-50/50 border border-emerald-100/40 rounded-xl">
                    <CloudLightning className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <span className="text-[11px] font-bold text-emerald-800 block">Sinkronisasi Background Aktif</span>
                      <span className="text-[9px] text-slate-400 block leading-tight">Data Anda tersinkronisasi otomatis setiap 30 detik melalui gerbang server pusat.</span>
                    </div>
                  </div>

                  {spreadsheetId ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Koneksi Database:</span>
                        <span className="font-bold text-emerald-600 font-mono text-[10px]">TERHUBUNG</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Sinkron Terakhir:</span>
                        <span className="font-bold text-slate-700 font-mono">{lastSynced || 'Pending...'}</span>
                      </div>

                      {lastPayrollSync && (
                        <div className="text-[10px] text-amber-600 bg-amber-50/40 rounded-lg py-1.5 px-2.5 border border-amber-100/30 text-center font-mono leading-relaxed">
                          Terakhir sync gaji/komisi dari Sheets: {new Date(lastPayrollSync).toLocaleTimeString()}
                        </div>
                      )}
                      
                      {/* Manual Sync Trigger */}
                      <button
                        onClick={() => handleIncrementalSync(false)}
                        disabled={syncStatus === 'syncing'}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Sinkronisasikan Sekarang</span>
                      </button>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl text-amber-800 text-xs space-y-1">
                      <p className="font-bold">Koneksi Database Tertunda</p>
                      <p className="text-[10px] leading-relaxed">
                        HQ Manager belum melengkapi konfigurasi database spreadsheet. Harap hubungi manager Anda untuk menghubungkan Google Sheets.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Loader overlay */}
              {syncStatus === 'syncing' && (
                <div className="bg-white/80 absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin" />
                  <span className="text-xs font-bold text-slate-700">Menyelaraskan Data...</span>
                </div>
              )}

              {/* Error messages */}
              {errorMessage && (
                <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-xl p-3 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <p className="leading-normal flex-1">{errorMessage}</p>
                </div>
              )}

              {/* Honest status for a sync that read the Sheet fine but
                  couldn't be saved to the database because of this
                  account's role - previously this looked identical to a
                  fully successful sync, with no indication anything was
                  missing. */}
              {persistBlockedForRole && !errorMessage && (
                <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-3 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="leading-normal flex-1">
                    Data terbaru dari Sheet sudah dibaca, tapi akun Anda ({currentUser?.role}) tidak bisa menyimpannya ke database.
                    Minta Manager cabang atau HKA Management untuk menekan "Sinkronisasikan Sekarang" agar perubahan benar-benar tersimpan.
                  </p>
                </div>
              )}

              {/* Conflict logs list */}
              {conflictLogs.length > 0 && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1.5 max-h-32 overflow-y-auto">
                  <span className="text-[9px] font-bold text-slate-400 uppercase font-mono tracking-wider">Log Penyelarasan Konflik:</span>
                  <div className="space-y-1">
                    {conflictLogs.map((log, idx) => (
                      <p key={idx} className="text-[9px] text-slate-500 leading-normal border-l border-amber-300 pl-1.5 font-sans">
                        {log}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
