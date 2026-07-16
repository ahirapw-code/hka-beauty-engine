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
    
    const requiredTitles = ['Customers', 'Bookings', 'Transactions', 'Therapists', 'Products', 'Services', 'Expenses', 'Attendance', 'Users'];
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
      range: 'Customers!A1:I',
      values: [
        ['id', 'name', 'email', 'phone', 'totalSpend', 'visitsCount', 'lastVisit', 'notes', 'preferredBranch'],
        ...data.customers.map(c => [c.id, c.name, c.email, c.phone, c.totalSpend, c.visitsCount, c.lastVisit || '', c.notes || '', c.preferredBranch])
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
      range: 'Therapists!A1:K',
      values: [
        ['id', 'name', 'branch', 'specialties', 'rating', 'commissionRate', 'totalCommissionEarned', 'status', 'monthlyTarget', 'currentSales', 'baseSalary'],
        ...data.therapists.map(t => [t.id, t.name, t.branch, t.specialties.join(','), t.rating, t.commissionRate, t.totalCommissionEarned, t.status, t.monthlyTarget || 5000, t.currentSales || 0, t.baseSalary || 0])
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

  const ranges = ['Customers!A1:I', 'Bookings!A1:N', 'Transactions!A1:J', 'Therapists!A1:J', 'Products!A1:I', 'Services!A1:F', 'Expenses!A1:F', 'Attendance!A1:J', 'Users!A1:G'];
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
      return [item.id, item.name, item.email, item.phone, String(item.totalSpend), String(item.visitsCount), item.lastVisit || '', item.notes || '', item.preferredBranch];
    case 'Bookings':
      return [item.id, item.customerName, item.customerPhone, item.serviceId, item.serviceName, item.therapistId, item.therapistName, item.branch, item.date, item.time, String(item.duration), String(item.price), item.status, item.notes || ''];
    case 'Transactions':
      return [item.id, item.date || '', item.customerName, item.branch, String(item.subtotal), String(item.discount), String(item.total), item.paymentMethod, item.cashierName, JSON.stringify(item.items)];
    case 'Therapists':
      return [item.id, item.name, item.branch, item.specialties.join(','), String(item.rating), String(item.commissionRate), String(item.totalCommissionEarned), item.status, String(item.monthlyTarget || 5000), String(item.currentSales || 0), String(item.baseSalary || 0)];
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
    const ranges = ['Customers!A1:I', 'Bookings!A1:N', 'Transactions!A1:J', 'Therapists!A1:K', 'Products!A1:I', 'Services!A1:F', 'Expenses!A1:F', 'Attendance!A1:J', 'Users!A1:G'];
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

    // Map: id -> { rowNum, values }
    const remoteMap = new Map<string, { rowIndex: number; rowValues: any[] }>();
    dataRows.forEach((row, idx) => {
      const id = row[0];
      if (id) {
        remoteMap.set(id, { rowIndex: idx + 2, rowValues: row });
      }
    });

    const lastSyncedSheet = lastSyncedRaw[sheetName] || {};
    let localRecords: any[] = [];
    let setLocalRecords: (items: any[]) => void = () => {};
    let lastCol = 'I';

    if (sheetName === 'Customers') { localRecords = localData.customers; setLocalRecords = (it) => { updatedLocalData.customers = it; }; lastCol = 'I'; }
    else if (sheetName === 'Bookings') { localRecords = localData.bookings; setLocalRecords = (it) => { updatedLocalData.bookings = it; }; lastCol = 'N'; }
    else if (sheetName === 'Transactions') { localRecords = localData.transactions; setLocalRecords = (it) => { updatedLocalData.transactions = it; }; lastCol = 'J'; }
    else if (sheetName === 'Therapists') { localRecords = localData.therapists; setLocalRecords = (it) => { updatedLocalData.therapists = it; }; lastCol = 'K'; }
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
        if (lastSyncedRow) {
          if (headers.length === 0) {
            // The read for this whole sheet came back with no header row -
            // that means the read itself failed or hit the wrong tab, not
            // that every row was deleted. Treating this as a mass-delete is
            // exactly what caused data to "revert to mock data" before.
            // Keep the record and let the next successful sync reconcile it.
            conflictLog.push(`Sheet ${sheetName} gagal terbaca saat sync - data lokal dipertahankan, tidak dianggap terhapus.`);
            nextLocalRecords.push(record);
            newLastSyncedRaw[sheetName][id] = lastSyncedRow;
          } else {
            // The sheet read fine, and this specific row is genuinely gone -
            // honor the deletion, both locally and (via deletedIds) in MongoDB.
            conflictLog.push(`Record ${id} dihapus di Sheet - dihapus juga dari app.`);
            deletedIds[sheetName] = deletedIds[sheetName] || [];
            deletedIds[sheetName].push(id);
            // Not pushed to nextLocalRecords, and no baseline kept - it's gone.
          }
        } else {
          // New local record
          appendsToPush[sheetName].push(localRow);
          pushedCount++;
          nextLocalRecords.push(record);
          newLastSyncedRaw[sheetName][id] = localRow;
        }
      }
    }

    // Capture new remote records
    for (const [id, remoteInfo] of remoteMap.entries()) {
      if (!processedLocalIds.has(id)) {
        const parsedRemote = parseRawSheetValues(sheetName, headers, [remoteInfo.rowValues])[0];
        if (parsedRemote) nextLocalRecords.push(parsedRemote);
        newLastSyncedRaw[sheetName][id] = remoteInfo.rowValues;
      }
    }

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
      if (sheetName === 'Customers') { lastCol = 'I'; headers = ['id', 'name', 'email', 'phone', 'totalSpend', 'visitsCount', 'lastVisit', 'notes', 'preferredBranch']; }
      else if (sheetName === 'Bookings') { lastCol = 'N'; headers = ['id', 'customerName', 'customerPhone', 'serviceId', 'serviceName', 'therapistId', 'therapistName', 'branch', 'date', 'time', 'duration', 'price', 'status', 'notes']; }
      else if (sheetName === 'Transactions') { lastCol = 'J'; headers = ['id', 'date', 'customerName', 'branch', 'subtotal', 'discount', 'total', 'paymentMethod', 'cashierName', 'items_json']; }
      else if (sheetName === 'Therapists') { lastCol = 'K'; headers = ['id', 'name', 'branch', 'specialties', 'rating', 'commissionRate', 'totalCommissionEarned', 'status', 'monthlyTarget', 'currentSales', 'baseSalary']; }
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

  return {
    updatedLocalData,
    conflictLog,
    pushedCount,
    deletedIds
  };
};
