import { auth } from './firebase';
import { Customer, Booking, Transaction, Therapist, Product, Service, Expense, Attendance } from '../types';

/**
 * Sends the reconciled dataset produced by syncStateToSpreadsheetIncremental
 * (src/lib/googleSheets.ts) to the server so it's actually saved to
 * MongoDB, not just held in React state. Management-only on the server
 * side (server/controllers/sheetsPersistController.ts). `users` is
 * intentionally not sent - account/auth fields are never sourced from
 * Sheets.
 */
export async function persistSheetsSyncToServer(
  data: {
    customers: Customer[];
    bookings: Booking[];
    transactions: Transaction[];
    therapists: Therapist[];
    products: Product[];
    services: Service[];
    expenses: Expense[];
    attendance: Attendance[];
  },
  deletedIds?: { [sheetName: string]: string[] }
): Promise<void> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    // Previously this silently returned here, which meant a sync could
    // "succeed" from the caller's point of view while never actually
    // reaching the server - no error, no log, nothing saved. Throwing
    // means the caller's catch block (GoogleSheetsSync.tsx) now surfaces
    // this as a visible conflict-log entry instead of a silent no-op.
    throw new Error(
      'Tidak dapat menyimpan hasil sync: sesi login tidak ditemukan (idToken kosong). Silakan login ulang.'
    );
  }

  const response = await fetch('/api/sheets/persist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      customers: data.customers,
      bookings: data.bookings,
      transactions: data.transactions,
      therapists: data.therapists,
      products: data.products,
      services: data.services,
      expenses: data.expenses,
      attendance: data.attendance,
      deletedIds: deletedIds || {},
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to persist Sheets sync (status ${response.status})`);
  }
}
