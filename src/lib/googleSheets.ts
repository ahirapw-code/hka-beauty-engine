import { Customer, Booking, Transaction, Therapist, Product, Service, Expense, Attendance, User } from '../types';

// --- Google Identity Services (GIS) OAuth for Sheets/Drive scopes ---
//
// This previously used Firebase Auth purely as a wrapper around Google's
// OAuth popup just to obtain an access token with Sheets/Drive scopes - it
// had nothing to do with app login. Now that Firebase has been removed
// entirely, we talk to Google's own Identity Services library directly.
//
// A minimal user-shaped object is kept so the rest of this file (and
// GoogleSheetsSync.tsx, which destructures `.email`/`.displayName` from it)
// keeps working unchanged.
export interface GoogleSheetsUser {
  uid: string;
  email: string;
  displayName?: string;
}

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const SHEETS_SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

// Header row for the "Managers" payroll-rate tab. This tab is intentionally
// separate from the "Users" tab and from the generic bidirectional data
// engine in this file (readAllDataFromSpreadsheet / writeAllDataToSpreadsheet
// / syncStateToSpreadsheetIncremental all skip it on purpose): it exists
// purely so HKA_MANAGEMENT can set commissionRate/baseSalary/monthlyTarget
// for Salon Manager accounts from a spreadsheet, the same way the
// "Therapists" tab's equivalent columns work - read one-way, audited, via
// POST /api/syncSheetsToFirestore (server/controllers/googleSheetsController.ts),
// never written back to here and never touching any other User field
// (role/branch/email/password stay fully out of Sheets, see
// sheetsPersistController.ts).
export const MANAGERS_SHEET_HEADERS = ['id', 'name', 'branch', 'commissionRate', 'baseSalary', 'status', 'monthlyTarget'];

let cachedAccessToken: string | null = null;
let cachedUser: GoogleSheetsUser | null = null;
let authListeners: Array<(user: GoogleSheetsUser | null) => void> = [];
let gisLoaded: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return resolve();
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
    document.head.appendChild(script);
  });
  return gisLoaded;
}

function notifyAuthListeners() {
  authListeners.forEach((cb) => cb(cachedUser));
}

// Initialize auth state listener. Signature preserved from the original
// Firebase-based implementation (onAuthSuccess/onAuthFailure callbacks).
export const initAuth = (
  onAuthSuccess?: (user: GoogleSheetsUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  const listener = (user: GoogleSheetsUser | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  };
  authListeners.push(listener);
  // Fire immediately with current state, mirroring Firebase's onAuthStateChanged.
  listener(cachedUser);
  return () => {
    authListeners = authListeners.filter((l) => l !== listener);
  };
};

// Sign in with Google Popup (via Google Identity Services token client)
export const googleSignIn = async (): Promise<{ user: GoogleSheetsUser; accessToken: string } | null> => {
  await loadGisScript();
  const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID is not configured. Set it in your environment to enable Google Sheets sync.'
    );
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SHEETS_SCOPES,
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          cachedAccessToken = response.access_token;

          // Fetch basic profile info to populate a user-shaped object.
          fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${response.access_token}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
            .then((profile) => {
              cachedUser = {
                uid: profile?.sub || 'google-user',
                email: profile?.email || '',
                displayName: profile?.name || '',
              };
              notifyAuthListeners();
              resolve({ user: cachedUser, accessToken: cachedAccessToken as string });
            });
        },
      });
      tokenClient.requestAccessToken();
    } catch (error) {
      console.error('Google Sign-In failed:', error);
      reject(error);
    }
  });
};

// Sign out
export const googleSignOut = async () => {
  if (cachedAccessToken && (window as any).google?.accounts?.oauth2?.revoke) {
    (window as any).google.accounts.oauth2.revoke(cachedAccessToken, () => {});
  }
  cachedAccessToken = null;
  cachedUser = null;
  notifyAuthListeners();
};

export const getCachedToken = () => cachedAccessToken;
export const setCachedToken = (token: string | null) => {
  cachedAccessToken = token;
};

// ----------------------------------------------------
// UTILITIES: RETRY WITH EXPONENTIAL BACKOFF
// ----------------------------------------------------
export const fetchWithRetry = async (
  url: string,
  options: RequestInit = {},
  retries = 3,
  delay = 1000
): Promise<Response> => {
  try {
    const res = await fetch(url, options);
    if (!res.ok && (res.status === 429 || res.status >= 500) && retries > 0) {
      console.warn(`Fetch failed with status ${res.status}. Retrying in ${delay}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    return res;
  } catch (error) {
    if (retries > 0) {
      console.warn(`Fetch network error. Retrying in ${delay}ms... (${retries} left)`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
};

// Ensure all required sheets exist in the spreadsheet
export const ensureSheetsExist = async (spreadsheetId: string, accessToken: string) => {
  try {
    const getRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!getRes.ok) return;

    const spreadsheet = await getRes.json();
    const existingTitles = (spreadsheet.sheets || []).map((s: any) => s.properties.title);
    
    const requiredTitles = ['Customers', 'Bookings', 'Transactions', 'Therapists', 'Products', 'Services', 'Expenses', 'Attendance', 'Users', 'Managers'];
    const missingTitles = requiredTitles.filter(t => !existingTitles.includes(t));
    
    if (missingTitles.length > 0) {
      const requests = missingTitles.map(title => ({
        addSheet: {
          properties: { title }
        }
      }));
      
      await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests })
      });

      // "Managers" is deliberately NOT part of the generic read/write data
      // engine below (see MANAGERS_SHEET_HEADERS for why), so unlike every
      // other tab its header row is never written by the normal sync loop.
      // Write it once here, right after the blank tab is created.
      if (missingTitles.includes('Managers')) {
        await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Managers!A1:G1?valueInputOption=RAW`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [MANAGERS_SHEET_HEADERS] })
        });
      }
    }
  } catch (error) {
    console.error('Failed to ensure all sheets exist:', error);
  }
};

// Find or create spreadsheet
export const findOrCreateDatabase = async (
  accessToken: string,
  initialData: {
    customers: Customer[];
    bookings: Booking[];
    transactions: Transaction[];
    therapists: Therapist[];
    products: Product[];
    services: Service[];
    expenses: Expense[];
    attendance: Attendance[];
    users: User[];
  }
): Promise<string> => {
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name%3D'HKA+Salon+Database'+and+mimeType%3D'application%2Fvnd.google-apps.spreadsheet'+and+trashed%3Dfalse&fields=files(id,name)`;
  const searchRes = await fetchWithRetry(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!searchRes.ok) {
    throw new Error('Failed to query Google Drive');
  }
  
  const searchResult = await searchRes.json();
  if (searchResult.files && searchResult.files.length > 0) {
    const spreadsheetId = searchResult.files[0].id;
    await ensureSheetsExist(spreadsheetId, accessToken);
    return spreadsheetId;
  }

  const createRes = await fetchWithRetry('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: 'HKA Salon Database' },
      sheets: [
        { properties: { title: 'Customers' } },
        { properties: { title: 'Bookings' } },
        { properties: { title: 'Transactions' } },
        { properties: { title: 'Therapists' } },
        { properties: { title: 'Products' } },
        { properties: { title: 'Services' } },
        { properties: { title: 'Expenses' } },
        { properties: { title: 'Attendance' } },
        { properties: { title: 'Users' } },
        { properties: { title: 'Managers' } },
      ],
    }),
  });

  if (!createRes.ok) {
    throw new Error('Failed to create new Google Spreadsheet');
  }

  const createData = await createRes.json();
  const spreadsheetId = createData.spreadsheetId;

  await writeAllDataToSpreadsheet(spreadsheetId, accessToken, initialData);
  return spreadsheetId;
};

// Write all data (Overwrites whole sheets)
export const writeAllDataToSpreadsheet = async (
  spreadsheetId: string,
  accessToken: string,
  data: {
    customers: Customer[];
    bookings: Booking[];
    transactions: Transaction[];
    therapists: Therapist[];
    products: Product[];
    services: Service[];
    expenses: Expense[];
    attendance: Attendance[];
    users: User[];
  }
) => {
  await ensureSheetsExist(spreadsheetId, accessToken);

  const batchData = [
    {
      range: 'Customers!A1:K',
      values: [
        ['id', 'name', 'email', 'phone', 'totalSpend', 'visitsCount', 'lastVisit', 'notes', 'preferredBranch', 'isMember', 'memberSince'],
        ...data.customers.map(c => [c.id, c.name, c.email, c.phone, c.totalSpend, c.visitsCount, c.lastVisit || '', c.notes || '', c.preferredBranch, c.isMember ? 'TRUE' : 'FALSE', c.memberSince || ''])
      ]
    },
    {
      range: 'Bookings!A1:N',
      values: [
        ['id', 'customerName', 'customerPhone', 'serviceId', 'serviceName', 'therapistId', 'therapistName', 'branch', 'date', 'time', 'duration', 'price', 'status', 'notes'],
        ...data.bookings.map(b => [b.id, b.customerName, b.customerPhone, b.serviceId, b.serviceName, b.therapistId, b.therapistName, b.branch, b.date, b.time, b.duration, b.price, b.status, b.notes || ''])
      ]
    },
    {
      range: 'Transactions!A1:J',
      values: [
        ['id', 'date', 'customerName', 'branch', 'subtotal', 'discount', 'total', 'paymentMethod', 'cashierName', 'items_json'],
        ...data.transactions.map(t => [t.id, t.date || '', t.customerName, t.branch, t.subtotal, t.discount, t.total, t.paymentMethod, t.cashierName, JSON.stringify(t.items)])
      ]
    },
    {
      range: 'Therapists!A1:L',
      values: [
        ['id', 'name', 'branch', 'specialties', 'rating', 'commissionRate', 'totalCommissionEarned', 'status', 'monthlyTarget', 'currentSales', 'baseSalary', 'linkedUserId'],
        ...data.therapists.map(t => [t.id, t.name, t.branch, t.specialties.join(','), t.rating, t.commissionRate, t.totalCommissionEarned, t.status, t.monthlyTarget || 5000, t.currentSales || 0, t.baseSalary || 0, t.linkedUserId || ''])
      ]
    },
    {
      range: 'Products!A1:I',
      values: [
        ['id', 'name', 'sku', 'price', 'cost', 'stock', 'minStock', 'branch', 'category'],
        ...data.products.map(p => [p.id, p.name, p.sku, p.price, p.cost, p.stock, p.minStock, p.branch, p.category])
      ]
    },
    {
      range: 'Services!A1:F',
      values: [
        ['id', 'name', 'category', 'price', 'duration', 'branches'],
        ...data.services.map(s => [s.id, s.name, s.category, s.price, s.duration, s.branches.join(',')])
      ]
    },
    {
      range: 'Expenses!A1:F',
      values: [
        ['id', 'branch', 'category', 'amount', 'date', 'description'],
        ...data.expenses.map(e => [e.id, e.branch, e.category, e.amount, e.date, e.description])
      ]
    },
    {
      range: 'Attendance!A1:J',
      values: [
        ['id', 'userId', 'userName', 'role', 'branch', 'date', 'clockIn', 'clockOut', 'status', 'notes'],
        ...data.attendance.map(a => [a.id, a.userId, a.userName, a.role, a.branch, a.date, a.clockIn, a.clockOut || '', a.status, a.notes || ''])
      ]
    },
    {
      range: 'Users!A1:G',
      values: [
        ['id', 'username', 'name', 'role', 'branch', 'email', 'avatar'],
        ...data.users.map(u => [u.id, u.username, u.name, u.role, u.branch, u.email, u.avatar || ''])
      ]
    }
  ];

  const updateRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: batchData
    }),
  });

  if (!updateRes.ok) {
    throw new Error('Failed to synchronize data to Google Sheets');
  }
};

// Read all data collections
export const readAllDataFromSpreadsheet = async (spreadsheetId: string, accessToken: string) => {
  await ensureSheetsExist(spreadsheetId, accessToken);

  const ranges = ['Customers!A1:K', 'Bookings!A1:N', 'Transactions!A1:J', 'Therapists!A1:L', 'Products!A1:I', 'Services!A1:F', 'Expenses!A1:F', 'Attendance!A1:J', 'Users!A1:G'];
  // valueRenderOption=UNFORMATTED_VALUE is critical here: without it, Sheets
  // returns cells as their *display* string (e.g. "Rp50.000" for a
  // currency-formatted price cell). Number("Rp50.000") is NaN, which
  // parseRawSheetValues below silently coerces to 0 - so any price/duration
  // cell with number formatting applied would read back as 0.
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${ranges.join('&ranges=')}&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to read data from Google Sheets');
  }

  const result = await res.json();
  const valueRanges = result.valueRanges;
  const data: any = { customers: [], bookings: [], transactions: [], therapists: [], products: [], services: [], expenses: [], attendance: [], users: [] };

  valueRanges.forEach((rangeObj: any) => {
    const rangeName = rangeObj.range;
    const values = rangeObj.values || [];
    if (values.length === 0) return;

    const headers = values[0];
    const rows = values.slice(1);
    const key = rangeName.split('!')[0].toLowerCase();

    if (data[key] !== undefined) {
      data[key] = parseRawSheetValues(rangeName.split('!')[0], headers, rows);
    }
  });

  return data;
};

// ----------------------------------------------------
// DUAL-MODE INCREMENTAL SYNCHRONIZER
// ----------------------------------------------------

export interface SyncResult {
  updatedLocalData: {
    customers: Customer[];
    bookings: Booking[];
    transactions: Transaction[];
    therapists: Therapist[];
    products: Product[];
    services: Service[];
    expenses: Expense[];
    attendance: Attendance[];
    users: User[];
  };
  conflictLog: string[];
  pushedCount: number;
  deletedIds: { [sheetName: string]: string[] };
}

// Map a business object to cell values array
export const recordToRow = (sheetName: string, item: any): any[] => {
  switch (sheetName) {
    case 'Customers':
      return [item.id, item.name, item.email, item.phone, String(item.totalSpend), String(item.visitsCount), item.lastVisit || '', item.notes || '', item.preferredBranch, item.isMember ? 'TRUE' : 'FALSE', item.memberSince || ''];
    case 'Bookings':
      return [item.id, item.customerName, item.customerPhone, item.serviceId, item.serviceName, item.therapistId, item.therapistName, item.branch, item.date, item.time, String(item.duration), String(item.price), item.status, item.notes || ''];
    case 'Transactions':
      return [item.id, item.date || '', item.customerName, item.branch, String(item.subtotal), String(item.discount), String(item.total), item.paymentMethod, item.cashierName, JSON.stringify(item.items)];
    case 'Therapists':
      return [item.id, item.name, item.branch, item.specialties.join(','), String(item.rating), String(item.commissionRate), String(item.totalCommissionEarned), item.status, String(item.monthlyTarget || 5000), String(item.currentSales || 0), String(item.baseSalary || 0), item.linkedUserId || ''];
    case 'Products':
      return [item.id, item.name, item.sku, String(item.price), String(item.cost), String(item.stock), String(item.minStock), item.branch, item.category];
    case 'Services':
      return [item.id, item.name, item.category, String(item.price), String(item.duration), (item.branches || []).join(',')];
    case 'Expenses':
      return [item.id, item.branch, item.category, String(item.amount), item.date, item.description];
    case 'Attendance':
      return [item.id, item.userId, item.userName, item.role, item.branch, item.date, item.clockIn, item.clockOut || '', item.status, item.notes || ''];
    case 'Users':
      return [item.id, item.username, item.name, item.role, item.branch, item.email, item.avatar || ''];
    default:
      return [];
  }
};

// Coerce a sheet cell into a number even if it arrived as a formatted
// display string (e.g. "Rp50.000", "50,000", " 1.250,5 "). Requesting
// UNFORMATTED_VALUE from the Sheets API should make this unnecessary in the
// normal REST path, but this stays as a defensive fallback for the Apps
// Script path and for values already stored as text in a cell.
const parseNumericCell = (val: any): number => {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val === null || val === undefined || val === '') return 0;
  const direct = Number(val);
  if (Number.isFinite(direct)) return direct;
  // Strip anything that isn't a digit, minus sign, or separator, then drop
  // thousands separators (assume the last '.' or ',' before <=2 trailing
  // digits is the decimal point; otherwise treat all dots/commas as
  // thousands separators, which matches Indonesian Rupiah formatting).
  const cleaned = String(val).replace(/[^0-9.,-]/g, '');
  if (!cleaned) return 0;
  const decimalMatch = cleaned.match(/[.,](\d{1,2})$/);
  let normalized: string;
  if (decimalMatch) {
    const decimals = decimalMatch[1];
    const wholePart = cleaned.slice(0, cleaned.length - decimals.length - 1).replace(/[.,]/g, '');
    normalized = `${wholePart}.${decimals}`;
  } else {
    normalized = cleaned.replace(/[.,]/g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Parse raw 2D array sheet rows into structured objects
export const parseRawSheetValues = (sheetName: string, headers: string[], rows: any[][]): any[] => {
  return rows.map((row: any[]) => {
    const obj: any = {};
    headers.forEach((header: string, i: number) => {
      const val = row[i];
      if (['totalSpend', 'visitsCount', 'price', 'duration', 'subtotal', 'discount', 'total', 'rating', 'commissionRate', 'totalCommissionEarned', 'monthlyTarget', 'currentSales', 'cost', 'stock', 'minStock', 'amount', 'baseSalary'].includes(header)) {
        obj[header] = parseNumericCell(val);
      } else if (header === 'isMember') {
        // Sheets can hand this back as a real boolean (checkbox-formatted
        // cell) or as text ('TRUE'/'FALSE'/'1') depending on how the cell
        // was entered - normalize both to a real boolean either way.
        obj[header] = val === true || String(val).trim().toUpperCase() === 'TRUE' || String(val).trim() === '1';
      } else if (header === 'specialties' || header === 'branches') {
        obj[header] = val ? val.split(',') : [];
      } else if (header === 'items_json') {
        try {
          obj['items'] = val ? JSON.parse(val) : [];
        } catch (e) {
          obj['items'] = [];
        }
      } else {
        obj[header] = val || '';
      }
    });
    return obj;
  });
};

// Comparison utility to check if cells are identical
const areRowsEqual = (row1: any[], row2: any[]): boolean => {
  if (!row1 || !row2) return false;
  const len = Math.max(row1.length, row2.length);
  for (let i = 0; i < len; i++) {
    const v1 = row1[i] !== undefined ? String(row1[i]) : '';
    const v2 = row2[i] !== undefined ? String(row2[i]) : '';
    if (v1 !== v2) return false;
  }
  return true;
};

// Core Bidirectional Incremental Sync Engine
export const syncStateToSpreadsheetIncremental = async (
  spreadsheetId: string,
  accessToken: string | null,
  localData: {
    customers: Customer[];
    bookings: Booking[];
    transactions: Transaction[];
    therapists: Therapist[];
    products: Product[];
    services: Service[];
    expenses: Expense[];
    attendance: Attendance[];
    users: User[];
  },
  appsScriptUrl: string | null = null
): Promise<SyncResult> => {
  let remoteDataRaw: { [sheetName: string]: any[][] } = {};

  // 1. Fetch remote sheet values
  if (appsScriptUrl) {
    const res = await fetchWithRetry(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'read', spreadsheetId })
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('SESSION_EXPIRED');
      throw new Error(`Apps Script failed: ${res.statusText}`);
    }
    const json = await res.json();
    if (json.status !== 'success') {
      throw new Error(json.message || 'Apps Script execution failed');
    }
    remoteDataRaw = json.data;
  } else {
    if (!accessToken) throw new Error('SESSION_EXPIRED');
    const ranges = ['Customers!A1:K', 'Bookings!A1:N', 'Transactions!A1:J', 'Therapists!A1:L', 'Products!A1:I', 'Services!A1:F', 'Expenses!A1:F', 'Attendance!A1:J', 'Users!A1:G'];
    // See note in readAllDataFromSpreadsheet: UNFORMATTED_VALUE avoids reading
    // currency-formatted price cells back as strings like "Rp50.000".
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${ranges.join('&ranges=')}&valueRenderOption=UNFORMATTED_VALUE`;
    const res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('SESSION_EXPIRED');
      throw new Error(`Sheets API failed: ${res.statusText}`);
    }
    const json = await res.json();
    const valueRanges = json.valueRanges || [];
    valueRanges.forEach((vr: any) => {
      const match = vr.range.match(/^'?([^'!]+)'?!/);
      const sheetName = match ? match[1] : '';
      if (sheetName) {
        remoteDataRaw[sheetName] = vr.values || [];
      }
    });
  }

  // 2. Load previous sync baseline
  const lastSyncedRawStr = localStorage.getItem('hka_sheets_last_synced_data');
  const lastSyncedRaw = lastSyncedRawStr ? JSON.parse(lastSyncedRawStr) : {};

  // 2b. Load the previous run's "missing candidates" - ids that had a sync
  // baseline but weren't found in local state on the LAST sync pass (see
  // the "Capture new remote records" section below). Deletion through that
  // path now requires seeing the same id missing on two consecutive sync
  // passes in a row before it's treated as a deliberate app-side deletion,
  // rather than deleting the instant it's absent even once. A record can
  // look transiently absent from local state for reasons that have nothing
  // to do with someone deleting it - a page reload racing the initial data
  // poll, a brief network hiccup on the 4s polling fetch, a background tab
  // getting throttled - and a single miss used to be enough to permanently
  // wipe it from the Sheet and the database. Requiring two consecutive
  // misses (roughly one auto-sync interval apart) still lets real
  // deletions (e.g. ERP's "Revoke operator credentials" button) go
  // through, just one cycle later, while giving transient blips a chance
  // to self-correct first.
  const missingCandidatesRawStr = localStorage.getItem('hka_sheets_missing_candidates');
  const previousMissingCandidates: { [sheetName: string]: string[] } = missingCandidatesRawStr
    ? JSON.parse(missingCandidatesRawStr)
    : {};
  const nextMissingCandidates: { [sheetName: string]: string[] } = {};

  const sheetNames = ['Customers', 'Bookings', 'Transactions', 'Therapists', 'Products', 'Services', 'Expenses', 'Attendance', 'Users'];
  const updatesToPush: { sheet: string; range: string; values: any[][] }[] = [];
  const appendsToPush: { [sheetName: string]: any[][] } = {};
  const deletedIds: { [sheetName: string]: string[] } = {};
  
  const updatedLocalData: any = {
    customers: [...localData.customers],
    bookings: [...localData.bookings],
    transactions: [...localData.transactions],
    therapists: [...localData.therapists],
    products: [...localData.products],
    services: [...localData.services],
    expenses: [...localData.expenses],
    attendance: [...localData.attendance],
    users: [...localData.users]
  };

  const conflictLog: string[] = [];
  let pushedCount = 0;
  const newLastSyncedRaw: { [sheetName: string]: { [id: string]: any[] } } = {};

  // 3. Process each sheet collection
  for (const sheetName of sheetNames) {
    newLastSyncedRaw[sheetName] = {};
    const remoteRows = remoteDataRaw[sheetName] || [];
    const headers = remoteRows[0] || [];
    const dataRows = remoteRows.slice(1);
    // True only when the read succeeded (we have a header row) AND every
    // data row underneath it is gone - i.e. someone deliberately cleared
    // the whole tab down to just headers. Distinct from headers.length===0
    // below, which means the read itself failed/hit the wrong tab.
    const sheetIsEmptied = headers.length > 0 && dataRows.length === 0;

    // Map: id -> { rowNum, values }
    const remoteMap = new Map<string, { rowIndex: number; rowValues: any[] }>();
    dataRows.forEach((row, idx) => {
      const id = row[0];
      if (id) {
        remoteMap.set(id, { rowIndex: idx + 2, rowValues: row });
      } else if (row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== '')) {
        // Row has real content (e.g. someone typed isMember/memberSince by
        // hand) but column A (id) is blank - this row is invisible to the
        // sync engine and will silently never update anything. Previously
        // this was dropped with no trace, which looks exactly like "I set
        // isMember in the sheet but it never sticks" when the real cause is
        // a missing/blank id cell on that specific row.
        conflictLog.push(
          `Baris ${idx + 2} di tab ${sheetName} punya data tapi kolom "id" kosong - baris ini dilewati (tidak disinkronkan). Isi kolom id dengan ID customer/record yang benar dari app.`
        );
      }
    });

    const lastSyncedSheet = lastSyncedRaw[sheetName] || {};
    let localRecords: any[] = [];
    let setLocalRecords: (items: any[]) => void = () => {};
    let lastCol = 'I';

    if (sheetName === 'Customers') { localRecords = localData.customers; setLocalRecords = (it) => { updatedLocalData.customers = it; }; lastCol = 'K'; }
    else if (sheetName === 'Bookings') { localRecords = localData.bookings; setLocalRecords = (it) => { updatedLocalData.bookings = it; }; lastCol = 'N'; }
    else if (sheetName === 'Transactions') { localRecords = localData.transactions; setLocalRecords = (it) => { updatedLocalData.transactions = it; }; lastCol = 'J'; }
    else if (sheetName === 'Therapists') { localRecords = localData.therapists; setLocalRecords = (it) => { updatedLocalData.therapists = it; }; lastCol = 'L'; }
    else if (sheetName === 'Products') { localRecords = localData.products; setLocalRecords = (it) => { updatedLocalData.products = it; }; lastCol = 'I'; }
    else if (sheetName === 'Services') { localRecords = localData.services; setLocalRecords = (it) => { updatedLocalData.services = it; }; lastCol = 'F'; }
    else if (sheetName === 'Expenses') { localRecords = localData.expenses; setLocalRecords = (it) => { updatedLocalData.expenses = it; }; lastCol = 'F'; }
    else if (sheetName === 'Attendance') { localRecords = localData.attendance; setLocalRecords = (it) => { updatedLocalData.attendance = it; }; lastCol = 'J'; }
    else if (sheetName === 'Users') { localRecords = localData.users; setLocalRecords = (it) => { updatedLocalData.users = it; }; lastCol = 'G'; }

    const processedLocalIds = new Set<string>();
    const nextLocalRecords: any[] = [];
    appendsToPush[sheetName] = [];

    // Analyze local records
    for (const record of localRecords) {
      const id = record.id;
      processedLocalIds.add(id);

      const localRow = recordToRow(sheetName, record);
      const remoteInfo = remoteMap.get(id);
      const lastSyncedRow = lastSyncedSheet[id];

      if (remoteInfo) {
        const remoteRow = remoteInfo.rowValues;
        const rowNum = remoteInfo.rowIndex;

        if (!lastSyncedRow) {
          // No baseline yet for this record on this device (first sync ever,
          // a new browser/device, or a cleared cache). We have no way to
          // know whether "local" or "remote" reflects the intentional edit
          // here - defaulting to "push local" (the old behaviour) silently
          // overwrites whatever was just typed into the Sheet with whatever
          // this browser happened to have in memory. Always defer to the
          // Sheet in this case; it's the value a human deliberately entered.
          const parsedRemote = parseRawSheetValues(sheetName, headers, [remoteRow])[0];
          nextLocalRecords.push(parsedRemote);
          newLastSyncedRaw[sheetName][id] = remoteRow;
        } else {
          const remoteChanged = !areRowsEqual(remoteRow, lastSyncedRow);
          const localChanged = !areRowsEqual(localRow, lastSyncedRow);

          if (remoteChanged && localChanged) {
            // Conflict: Keep remote (truth)
            const parsedRemote = parseRawSheetValues(sheetName, headers, [remoteRow])[0];
            nextLocalRecords.push(parsedRemote);
            conflictLog.push(`Konflik pada tab ${sheetName} (ID: ${id}) diselesaikan dengan mempertahankan data cloud.`);
            newLastSyncedRaw[sheetName][id] = remoteRow;
          } else if (remoteChanged) {
            // Sync remote
            const parsedRemote = parseRawSheetValues(sheetName, headers, [remoteRow])[0];
            nextLocalRecords.push(parsedRemote);
            newLastSyncedRaw[sheetName][id] = remoteRow;
          } else if (localChanged) {
            // Push local
            updatesToPush.push({ sheet: sheetName, range: `${sheetName}!A${rowNum}:${lastCol}${rowNum}`, values: [localRow] });
            pushedCount++;
            nextLocalRecords.push(record);
            newLastSyncedRaw[sheetName][id] = localRow;
          } else {
            // Matches
            nextLocalRecords.push(record);
            newLastSyncedRaw[sheetName][id] = remoteRow;
          }
        }
      } else {
        if (!lastSyncedRow) {
          // No sync baseline for this record at all - it has never been
          // written to the Sheet yet (e.g. created moments ago, in between
          // sync runs, or this is the very first sync on this
          // browser/device). This is ALWAYS a brand-new local record, full
          // stop - never a deletion, even if the tab currently happens to
          // be empty (sheetIsEmptied). A record can't have been "removed
          // from the Sheet" if it was never on the Sheet in the first
          // place. Checking this before sheetIsEmptied is the fix: the old
          // order let sheetIsEmptied win regardless of baseline, which
          // meant any booking (or other record) created while the
          // connected tab happened to have zero data rows - a completely
          // normal, non-deliberate state, not just a manual clear-out - was
          // immediately deleted from the app AND the database on the next
          // auto-sync, often within seconds of being created.
          appendsToPush[sheetName].push(localRow);
          pushedCount++;
          nextLocalRecords.push(record);
          newLastSyncedRaw[sheetName][id] = localRow;
          continue;
        }

        if (sheetIsEmptied) {
          // The whole tab (aside from its header row) is empty, AND this
          // record does have a prior baseline - i.e. it really was on the
          // Sheet before. Treat this as an explicit, deliberate reset of
          // this collection.
          conflictLog.push(
            `Tab ${sheetName} dikosongkan (hanya header tersisa) - record ${id} dianggap sengaja dihapus, ikut dihapus dari app & database.`
          );
          deletedIds[sheetName] = deletedIds[sheetName] || [];
          deletedIds[sheetName].push(id);
          // Not pushed to nextLocalRecords, and no baseline kept - it's gone.
        } else if (headers.length === 0) {
          // The read for this whole sheet came back with no header row -
          // that means the read itself failed or hit the wrong tab, not
          // that every row was deleted. Treating this as a mass-delete is
          // exactly what caused data to "revert to mock data" before.
          // Keep the record and let the next successful sync reconcile it.
          conflictLog.push(`Sheet ${sheetName} gagal terbaca saat sync - data lokal dipertahankan, tidak dianggap terhapus.`);
          nextLocalRecords.push(record);
          newLastSyncedRaw[sheetName][id] = lastSyncedRow;
        } else {
          // The sheet read fine, this record has a prior baseline, and this
          // specific row is genuinely gone - honor the deletion, both
          // locally and (via deletedIds) in MongoDB.
          conflictLog.push(`Record ${id} dihapus di Sheet - dihapus juga dari app.`);
          deletedIds[sheetName] = deletedIds[sheetName] || [];
          deletedIds[sheetName].push(id);
          // Not pushed to nextLocalRecords, and no baseline kept - it's gone.
        }
      }
    }

    // Capture new remote records
    const previousMissingForSheet = new Set(previousMissingCandidates[sheetName] || []);
    const missingThisRunForSheet: string[] = [];

    for (const [id, remoteInfo] of remoteMap.entries()) {
      if (!processedLocalIds.has(id)) {
        if (headers.length > 0 && lastSyncedSheet[id]) {
          // We have a sync baseline for this id (we've seen/synced it
          // before), and it's missing from local state right now. That's
          // consistent with a deliberate removal on this side (e.g. ERP's
          // "Revoke operator credentials" delete button) - but it's also
          // consistent with a transient gap in local state that has
          // nothing to do with deletion. Only act on it once it's been
          // observed missing on two consecutive sync passes; a single
          // miss just gets remembered as a candidate for next time.
          missingThisRunForSheet.push(id);

          if (!previousMissingForSheet.has(id)) {
            // First time seeing this id missing - not confirmed yet.
            // Deliberately don't touch nextLocalRecords, the Sheet, or
            // deletedIds this run: if the gap was transient, the next
            // independent data poll (every 4s, straight from the
            // database) will have already refilled local state with the
            // real record well before the next 30s sync tick, so it won't
            // show up as missing again and nothing gets deleted. If it's
            // a genuine deletion, it'll still be missing next time and
            // will be honored then.
            continue;
          }

          // Missing on two consecutive passes now - honor the deletion,
          // both locally and (via deletedIds) in MongoDB.
          conflictLog.push(
            `Record ${id} dihapus di app - baris di Sheet ${sheetName} dikosongkan agar tidak muncul kembali.`
          );
          const blankRow = new Array(headers.length).fill('');
          updatesToPush.push({
            sheet: sheetName,
            range: `${sheetName}!A${remoteInfo.rowIndex}:${lastCol}${remoteInfo.rowIndex}`,
            values: [blankRow],
          });
          deletedIds[sheetName] = deletedIds[sheetName] || [];
          deletedIds[sheetName].push(id);
          continue;
        }
        const parsedRemote = parseRawSheetValues(sheetName, headers, [remoteInfo.rowValues])[0];
        if (parsedRemote) nextLocalRecords.push(parsedRemote);
        newLastSyncedRaw[sheetName][id] = remoteInfo.rowValues;
      }
    }

    nextMissingCandidates[sheetName] = missingThisRunForSheet;
    setLocalRecords(nextLocalRecords);
  }

  // 4. Formulate appends into batch ranges
  for (const sheetName of sheetNames) {
    const appends = appendsToPush[sheetName];
    if (appends && appends.length > 0) {
      const remoteRows = remoteDataRaw[sheetName] || [];
      const N = remoteRows.length;
      let lastCol = 'I';
      let headers: string[] = [];
      if (sheetName === 'Customers') { lastCol = 'K'; headers = ['id', 'name', 'email', 'phone', 'totalSpend', 'visitsCount', 'lastVisit', 'notes', 'preferredBranch', 'isMember', 'memberSince']; }
      else if (sheetName === 'Bookings') { lastCol = 'N'; headers = ['id', 'customerName', 'customerPhone', 'serviceId', 'serviceName', 'therapistId', 'therapistName', 'branch', 'date', 'time', 'duration', 'price', 'status', 'notes']; }
      else if (sheetName === 'Transactions') { lastCol = 'J'; headers = ['id', 'date', 'customerName', 'branch', 'subtotal', 'discount', 'total', 'paymentMethod', 'cashierName', 'items_json']; }
      else if (sheetName === 'Therapists') { lastCol = 'L'; headers = ['id', 'name', 'branch', 'specialties', 'rating', 'commissionRate', 'totalCommissionEarned', 'status', 'monthlyTarget', 'currentSales', 'baseSalary', 'linkedUserId']; }
      else if (sheetName === 'Products') { lastCol = 'I'; headers = ['id', 'name', 'sku', 'price', 'cost', 'stock', 'minStock', 'branch', 'category']; }
      else if (sheetName === 'Services') { lastCol = 'F'; headers = ['id', 'name', 'category', 'price', 'duration', 'branches']; }
      else if (sheetName === 'Expenses') { lastCol = 'F'; headers = ['id', 'branch', 'category', 'amount', 'date', 'description']; }
      else if (sheetName === 'Attendance') { lastCol = 'J'; headers = ['id', 'userId', 'userName', 'role', 'branch', 'date', 'clockIn', 'clockOut', 'status', 'notes']; }
      else if (sheetName === 'Users') { lastCol = 'G'; headers = ['id', 'username', 'name', 'role', 'branch', 'email', 'avatar']; }

      if (N === 0) {
        updatesToPush.push({ sheet: sheetName, range: `${sheetName}!A1:${lastCol}1`, values: [headers] });
        updatesToPush.push({ sheet: sheetName, range: `${sheetName}!A2:${lastCol}${appends.length + 1}`, values: appends });
      } else {
        updatesToPush.push({ sheet: sheetName, range: `${sheetName}!A${N + 1}:${lastCol}${N + appends.length}`, values: appends });
      }
    }
  }

  // 5. Execute spreadsheet update
  if (updatesToPush.length > 0) {
    if (appsScriptUrl) {
      const res = await fetchWithRetry(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'write_incremental', spreadsheetId, updates: updatesToPush })
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('SESSION_EXPIRED');
        throw new Error(`Apps Script Write failed: ${res.statusText}`);
      }
    } else {
      if (!accessToken) throw new Error('SESSION_EXPIRED');
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'RAW', data: updatesToPush })
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error('SESSION_EXPIRED');
        throw new Error(`Sheets API Write failed: ${res.statusText}`);
      }
    }
  }

  // 6. Persist baseline values for optimistic locking
  localStorage.setItem('hka_sheets_last_synced_data', JSON.stringify(newLastSyncedRaw));
  localStorage.setItem('hka_sheets_missing_candidates', JSON.stringify(nextMissingCandidates));

  return {
    updatedLocalData,
    conflictLog,
    pushedCount,
    deletedIds
  };
};

/**
 * Appends a stub row (id, name, branch, blank commissionRate/baseSalary/
 * monthlyTarget, status) to the "Managers" payroll-rate tab for a
 * newly-registered (or newly-promoted) Salon Manager.
 *
 * Without this, the Managers tab (see MANAGERS_SHEET_HEADERS above) never
 * gets a row for a new manager on its own - it's intentionally excluded
 * from the generic bidirectional sync engine, and HKA_MANAGEMENT has no
 * practical way to discover the manager's auto-generated id to type into
 * the sheet by hand. This gives them a ready-made row with the correct id
 * pre-filled; commissionRate/baseSalary/monthlyTarget are left blank for
 * them to fill in, and syncSheetsToFirestore
 * (server/controllers/googleSheetsController.ts) picks those up the same
 * audited way it already does for existing rows.
 *
 * Best-effort by design: called right after a manager's account is created,
 * from a context where a failure here must never be treated as the
 * registration itself failing (mirrors the existing "matching Therapist
 * record" carve-out in ERP.tsx's handleRegisterUser).
 */
export const appendManagerStubRow = async (
  spreadsheetId: string,
  accessToken: string | null,
  appsScriptUrl: string | null,
  manager: { id: string; name: string; branch: string }
): Promise<void> => {
  await ensureSheetsExist(spreadsheetId, accessToken || '');

  let existingRows: any[][] = [];
  if (appsScriptUrl) {
    const res = await fetchWithRetry(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'read', spreadsheetId }),
    });
    if (!res.ok) throw new Error(`Apps Script fetch failed: ${res.statusText}`);
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.message || 'Apps Script read failed');
    existingRows = json.data?.['Managers'] || [];
  } else {
    if (!accessToken) throw new Error('SESSION_EXPIRED');
    const res = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Managers!A1:G`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Sheets API fetch failed: ${res.statusText}`);
    const json = await res.json();
    existingRows = json.values || [];
  }

  // Idempotent: if this manager already has a row (e.g. this ran once
  // already, or was added manually), don't append a second one.
  const dataRows = existingRows.slice(1);
  if (dataRows.some((row) => row[0] === manager.id)) return;

  const N = existingRows.length; // includes header row, if any
  const newRow = [manager.id, manager.name, manager.branch, '', '', 'active', ''];
  const updates: { sheet: string; range: string; values: any[][] }[] = [];

  if (N === 0) {
    updates.push({ sheet: 'Managers', range: 'Managers!A1:G1', values: [MANAGERS_SHEET_HEADERS] });
    updates.push({ sheet: 'Managers', range: 'Managers!A2:G2', values: [newRow] });
  } else {
    updates.push({ sheet: 'Managers', range: `Managers!A${N + 1}:G${N + 1}`, values: [newRow] });
  }

  if (appsScriptUrl) {
    const res = await fetchWithRetry(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'write_incremental', spreadsheetId, updates }),
    });
    if (!res.ok) throw new Error(`Apps Script write failed: ${res.statusText}`);
  } else {
    if (!accessToken) throw new Error('SESSION_EXPIRED');
    const res = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'RAW', data: updates }),
      }
    );
    if (!res.ok) throw new Error(`Sheets API write failed: ${res.statusText}`);
  }
};
