import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc,
  getDocs, 
  writeBatch 
} from './firestoreClient';
import { db, auth } from './firebase';
import { 
  Customer, 
  Booking, 
  Transaction, 
  Therapist, 
  Product, 
  Expense, 
  Attendance,
  Service
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const cleanMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: cleanMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  // Full diagnostic payload goes to the console for debugging, but the
  // user-facing error stays a clean, readable message - previously this
  // threw JSON.stringify(errInfo) itself, so any validation error (e.g.
  // "duration: Number must be greater than 0") ended up shown to the user
  // as a raw dump including their user id, email, and auth internals.
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(cleanMessage);
}

// 1. ADD CUSTOMER
export async function addCustomer(customer: Customer): Promise<void> {
  const path = `customers/${customer.id}`;
  try {
    await setDoc(doc(db, 'customers', customer.id), customer);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// 1b. ACTIVATE MEMBERSHIP (Basic tier registration by kasir/therapist)
// "customers" is write-locked in the generic /api/data API (managed via
// Google Sheets), so this goes through its own narrow, dedicated endpoint
// - same carve-out pattern as updateBookingStatus below. It only ever
// turns membership ON; it's idempotent if the customer is already a member.
export async function activateMembership(customerId: string): Promise<Customer> {
  const path = `customers/${customerId}/membership`;
  try {
    const idToken = await auth.currentUser?.getIdToken();
    const response = await fetch(`/api/customers/${customerId}/membership`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Failed to activate membership (status ${response.status})`);
    }
    return data.data as Customer;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

// 1b. ADD THERAPIST
// Creates the Therapist record that makes a staff member schedulable/
// bookable and visible in the Therapists Google Sheet tab - separate from
// their User login account (see server/controllers/recordsController.ts).
export async function addTherapist(therapist: {
  name: string;
  branch: 'NAO_STUDIO' | 'DIAEL_BEAUTY';
  specialties?: string[];
  linkedUserId?: string;
}): Promise<Therapist> {
  const path = `therapists/${therapist.name}`;
  try {
    const idToken = await auth.currentUser?.getIdToken();
    const response = await fetch('/api/therapists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify(therapist)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Failed to add therapist (status ${response.status})`);
    }
    return data.data as Therapist;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

// 2. ADD BOOKING
export async function addBooking(booking: Booking): Promise<Booking> {
  const path = `bookings/${booking.id}`;
  try {
    const idToken = await auth.currentUser?.getIdToken();
    const { id, ...body } = booking as any;
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Failed to create booking (status ${response.status})`);
    }
    // The server assigns the real _id (ignoring whatever id the client
    // generated) - return that record so the caller can add it straight to
    // local state instead of silently doing nothing and hoping the 4s
    // onSnapshot poll eventually picks it up.
    return (data.data || { ...booking }) as Booking;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// 3. UPDATE BOOKING STATUS & AUTO TRANSACTION
export async function updateBookingStatus(
  bookingId: string, 
  status: Booking['status'],
  transactionToAutoAdd?: Omit<Transaction, 'id' | 'date'>,
  customers: Customer[] = [],
  products: Product[] = [],
  therapists: Therapist[] = []
): Promise<void> {
  const path = `bookings/${bookingId}`;
  try {
    // Plain generic writes to "bookings" are intentionally blocked server-side
    // (see server/middleware/authorize.ts - corrections go through Sheets).
    // Check-in/complete/cancel are a deliberate, narrow exception to that,
    // so they go through their own dedicated endpoint instead of
    // updateDoc()/PATCH /api/data/bookings/:id, which now 403s.
    const idToken = await auth.currentUser?.getIdToken();
    const response = await fetch(`/api/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({ status })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Failed to update booking status (status ${response.status})`);
    }
    
    // If status is completed and there's a transaction payload, process transaction
    if (status === 'completed' && transactionToAutoAdd) {
      const txId = 'TX-' + Math.floor(Math.random() * 9000 + 1000);
      const dateStr = new Date().toISOString().substring(0, 19).replace('T', ' ');
      
      const completeTx: Transaction = {
        id: txId,
        date: dateStr,
        ...transactionToAutoAdd
      };
      
      await addTransaction(completeTx, customers, products, therapists);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// 4. ADD TRANSACTION (POS Sales & Cascade Updates)
// Returns the authoritative transaction id assigned by the server (the
// server is the source of truth for IDs; a client-generated id is no
// longer used to write the record).
export async function addTransaction(
  transaction: Transaction,
  customers: Customer[],
  products: Product[],
  therapists: Therapist[],
  invoiceDiscountValue: number = 0,
  invoiceDiscountType: 'percent' | 'flat' = 'flat'
): Promise<string> {
  const txPath = `transactions/${transaction.id}`;

  try {
    const idToken = await auth.currentUser?.getIdToken();
    // Generated once per checkout attempt so a network-level retry of this
    // exact request is recognized as a duplicate by the server instead of
    // being processed twice.
    const idempotencyKey = crypto.randomUUID();

    const response = await fetch('/api/processCheckout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({
        cart: transaction.items,
        invoiceDiscountValue,
        invoiceDiscountType,
        paymentMethod: transaction.paymentMethod,
        customerName: transaction.customerName,
        customerId: transaction.customerId,
        branch: transaction.branch,
        cashierName: transaction.cashierName,
        idempotencyKey
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Checkout failed with status ${response.status}`);
    }
    return data.id as string;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, txPath);
    throw error;
  }
}

// 5. RESTOCK PRODUCT
export async function restockProduct(id: string, amount: number, currentStock: number): Promise<void> {
  const path = `products/${id}`;
  try {
    await updateDoc(doc(db, 'products', id), {
      stock: currentStock + amount
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// 6. ADD EXPENSE
export async function addExpense(expense: Expense): Promise<void> {
  const path = `expenses/${expense.id}`;
  try {
    const idToken = await auth.currentUser?.getIdToken();
    const { id, ...body } = expense as any;
    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Failed to log expense (status ${response.status})`);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// 7. ADD ATTENDANCE (Clock In)
export async function addAttendance(record: Attendance): Promise<void> {
  const path = `attendance/${record.id}`;
  try {
    const idToken = await auth.currentUser?.getIdToken();
    const response = await fetch('/api/clockInOut', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({
        action: 'clockIn',
        record
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Clock-in failed with status ${response.status}`);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// 8. UPDATE ATTENDANCE (Clock Out)
export async function updateAttendance(
  attendanceId: string, 
  clockOut: string, 
  notes?: string
): Promise<void> {
  const path = `attendance/${attendanceId}`;
  try {
    const idToken = await auth.currentUser?.getIdToken();
    const response = await fetch('/api/clockInOut', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({
        action: 'clockOut',
        attendanceId,
        record: { clockOut, notes }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Clock-out failed with status ${response.status}`);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// 9. DATABASE INITIAL SEEDING HELPER
export async function seedDatabaseIfEmpty(
  customers: Customer[],
  bookings: Booking[],
  transactions: Transaction[],
  therapists: Therapist[],
  products: Product[],
  expenses: Expense[],
  attendance: Attendance[],
  services: Service[]
): Promise<void> {
  try {
    // A collection being empty does NOT mean "never seeded" - it might mean
    // someone genuinely deleted everything on purpose (e.g. via the Google
    // Sheets sync). Checking emptiness alone caused deleted data to get
    // silently re-created with the original mock/demo dataset on the very
    // next app load. A one-time persistent flag fixes this: seeding only
    // ever runs once, the first time this app is used against a brand new
    // database - never again after that, no matter how empty things get.
    const seedStatusSnap = await getDoc(doc(db, 'settings', 'seed_status'));
    if (seedStatusSnap.exists() && (seedStatusSnap.data() as any)?.seeded) {
      return;
    }

    // 0. Services
    const servicesSnap = await getDocs(collection(db, 'services'));
    if (servicesSnap.empty && services.length > 0) {
      const batch = writeBatch(db);
      services.forEach(s => {
        batch.set(doc(db, 'services', s.id), s);
      });
      await batch.commit();
      console.log('Successfully seeded services in Firestore.');
    }

    // 1. Customers
    const custSnap = await getDocs(collection(db, 'customers'));
    if (custSnap.empty && customers.length > 0) {
      const batch = writeBatch(db);
      customers.forEach(c => {
        batch.set(doc(db, 'customers', c.id), c);
      });
      await batch.commit();
      console.log('Successfully seeded customers in Firestore.');
    }

    // 2. Bookings
    const bookingsSnap = await getDocs(collection(db, 'bookings'));
    if (bookingsSnap.empty && bookings.length > 0) {
      const batch = writeBatch(db);
      bookings.forEach(b => {
        batch.set(doc(db, 'bookings', b.id), b);
      });
      await batch.commit();
      console.log('Successfully seeded bookings in Firestore.');
    }

    // 3. Transactions
    const txSnap = await getDocs(collection(db, 'transactions'));
    if (txSnap.empty && transactions.length > 0) {
      const batch = writeBatch(db);
      transactions.forEach(t => {
        batch.set(doc(db, 'transactions', t.id), t);
      });
      await batch.commit();
      console.log('Successfully seeded transactions in Firestore.');
    }

    // 4. Therapists
    const therapistsSnap = await getDocs(collection(db, 'therapists'));
    if (therapistsSnap.empty && therapists.length > 0) {
      const batch = writeBatch(db);
      therapists.forEach(t => {
        batch.set(doc(db, 'therapists', t.id), t);
      });
      await batch.commit();
      console.log('Successfully seeded therapists in Firestore.');
    }

    // 5. Products
    const productsSnap = await getDocs(collection(db, 'products'));
    if (productsSnap.empty && products.length > 0) {
      const batch = writeBatch(db);
      products.forEach(p => {
        batch.set(doc(db, 'products', p.id), p);
      });
      await batch.commit();
      console.log('Successfully seeded products in Firestore.');
    }

    // 6. Expenses
    const expensesSnap = await getDocs(collection(db, 'expenses'));
    if (expensesSnap.empty && expenses.length > 0) {
      const batch = writeBatch(db);
      expenses.forEach(e => {
        batch.set(doc(db, 'expenses', e.id), e);
      });
      await batch.commit();
      console.log('Successfully seeded expenses in Firestore.');
    }

    // 7. Attendance
    const attendanceSnap = await getDocs(collection(db, 'attendance'));
    if (attendanceSnap.empty && attendance.length > 0) {
      const batch = writeBatch(db);
      attendance.forEach(a => {
        batch.set(doc(db, 'attendance', a.id), a);
      });
      await batch.commit();
      console.log('Successfully seeded attendance in Firestore.');
    }

    // Mark this app instance as seeded - permanently. Even if every
    // collection above turns out empty again in the future (deletions via
    // Sheets, manual cleanup, etc), this will never run again.
    await setDoc(doc(db, 'settings', 'seed_status'), {
      seeded: true,
      seededAt: new Date().toISOString()
    }, { merge: true });

  } catch (error) {
    console.error('Error seeding database: ', error);
  }
}
