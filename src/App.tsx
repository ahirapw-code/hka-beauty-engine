import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { onAuthStateChanged } from './lib/authClient';
import { doc, getDoc, collection, getDocs, deleteDoc, updateDoc, onSnapshot } from './lib/firestoreClient';
import { auth, db } from './lib/firebase';
import { 
  User, 
  Branch, 
  Customer, 
  Booking, 
  Transaction, 
  Therapist, 
  Product, 
  Expense, 
  Service,
  Attendance 
} from './types';
import { INITIAL_THERAPISTS } from './data/mockData';
import {
  addCustomer,
  addBooking,
  updateBookingStatus,
  addTransaction,
  restockProduct,
  addExpense,
  addAttendance,
  updateAttendance,
  activateMembership,
  addTherapist
} from './lib/firestoreService';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import POS from './components/POS';
import ERP from './components/ERP';
import CRM from './components/CRM';
import Bookings from './components/Bookings';
import AttendanceComponent from './components/Attendance';
import AttendanceTerminal from './components/AttendanceTerminal';
import TherapistTarget from './components/TherapistTarget';
import GoogleSheetsSync from './components/GoogleSheetsSync';
import BranchSettings from './components/BranchSettings';
import PayrollComponent from './components/Payroll';
import MyPayroll from './components/MyPayroll';

// Run migration to IDR scale before any state initializes
(() => {
  const version = localStorage.getItem('hka_currency_version');
  if (version !== 'idr_2') {
    localStorage.removeItem('hka_customers');
    localStorage.removeItem('hka_bookings');
    localStorage.removeItem('hka_transactions');
    localStorage.removeItem('hka_therapists');
    localStorage.removeItem('hka_products');
    localStorage.removeItem('hka_expenses');
    localStorage.removeItem('hka_attendance');
    localStorage.setItem('hka_currency_version', 'idr_2');
  }
})();

export default function App() {
  // Authentication state
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('hka_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  // UI state
  const [activeTab, setActiveTab] = useState(() => {
    const savedUser = localStorage.getItem('hka_current_user');
    if (savedUser) {
      const u = JSON.parse(savedUser) as User;
      if (u.role === 'SALON_MANAGER') return 'pos';
      if (u.role === 'THERAPIST') return 'therapist-target';
    }
    return 'dashboard';
  });
  const [selectedBranch, setSelectedBranch] = useState<Branch>('ALL');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Business state engines loaded from localStorage initially as temporary/offline cache.
  // IMPORTANT: fallback is an empty array, NOT an INITIAL_*/PRESET_* mock
  // constant. Using mock data as a fallback here caused the Sheets sync
  // engine to treat every mock record as a "new local record" (their ids
  // don't exist in the real, since-edited spreadsheet) and append the
  // entire mock dataset back into the spreadsheet as bogus new rows. An
  // empty array is safe: the sync engine just defers entirely to the
  // spreadsheet/MongoDB until the real data has loaded.
  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem('hka_customers');
    return saved ? JSON.parse(saved) : [];
  });

  const [bookings, setBookings] = useState<Booking[]>(() => {
    const saved = localStorage.getItem('hka_bookings');
    return saved ? JSON.parse(saved) : [];
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('hka_transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [therapists, setTherapists] = useState<Therapist[]>(() => {
    const saved = localStorage.getItem('hka_therapists');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Therapist[];
        return parsed.map(t => {
          const defaultTher = INITIAL_THERAPISTS.find(it => it.id === t.id);
          return {
            ...t,
            monthlyTarget: t.monthlyTarget ?? defaultTher?.monthlyTarget ?? 5000,
            currentSales: t.currentSales ?? defaultTher?.currentSales ?? 0
          };
        });
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('hka_products');
    return saved ? JSON.parse(saved) : [];
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem('hka_expenses');
    return saved ? JSON.parse(saved) : [];
  });

  const [attendance, setAttendance] = useState<Attendance[]>(() => {
    const saved = localStorage.getItem('hka_attendance');
    return saved ? JSON.parse(saved) : [];
  });

  const [usersList, setUsersList] = useState<User[]>(() => {
    const saved = localStorage.getItem('hka_users_list');
    return saved ? JSON.parse(saved) : [];
  });

  const [services, setServices] = useState<Service[]>(() => {
    const saved = localStorage.getItem('hka_services');
    return saved ? JSON.parse(saved) : [];
  });

  // Tracks which collections have received at least one real response from
  // MongoDB. Kept as a second line of defense on top of the empty-array
  // fallback above: Sheets sync should still wait for real data rather than
  // running against a transient empty/partial state right at mount.
  const [loadedCollections, setLoadedCollections] = useState<Set<string>>(new Set());
  const REQUIRED_COLLECTIONS = ['customers', 'bookings', 'transactions', 'therapists', 'products', 'services', 'expenses', 'attendance', 'users'];
  const dataReady = REQUIRED_COLLECTIONS.every(c => loadedCollections.has(c));
  const markLoaded = (name: string) => {
    setLoadedCollections(prev => (prev.has(name) ? prev : new Set(prev).add(name)));
  };

  // Real-time synchronization of all business states with Firestore on mount/auth change
  useEffect(() => {
    if (!user) return;

    // NOTE: seedDatabaseIfEmpty() used to run here on every login, inserting
    // INITIAL_*/mock data into any collection MongoDB reported as empty.
    // That was fine for a brand-new install, but now that Sheets is the
    // source of truth and mock rows get correctly deleted end-to-end
    // (Sheet -> deletedIds -> MongoDB), a legitimately-emptied collection
    // would get reseeded with mock data on the very next login - which is
    // exactly the "mock data keeps coming back" bug this was chasing. Do
    // not reintroduce this call; if a fresh environment ever needs starter
    // data again, seed it once, explicitly, via a one-off script - not on
    // every app load.

    // 1. Customers Real-time sync
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const list: Customer[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Customer);
      });
      markLoaded('customers');
      setCustomers(list);
      localStorage.setItem('hka_customers', JSON.stringify(list));
    }, (error) => {
      console.error("Customers subscription error: ", error);
    });

    // 2. Bookings Real-time sync
    const unsubBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const list: Booking[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Booking);
      });
      markLoaded('bookings');
      setBookings(list);
      localStorage.setItem('hka_bookings', JSON.stringify(list));
    }, (error) => {
      console.error("Bookings subscription error: ", error);
    });

    // 3. Transactions Real-time sync
    const unsubTransactions = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      const list: Transaction[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Transaction);
      });
      markLoaded('transactions');
      // Sort descending by transaction date
      const sorted = list.sort((a, b) => b.date.localeCompare(a.date));
      setTransactions(sorted);
      localStorage.setItem('hka_transactions', JSON.stringify(sorted));
    }, (error) => {
      console.error("Transactions subscription error: ", error);
    });

    // 4. Therapists Real-time sync
    const unsubTherapists = onSnapshot(collection(db, 'therapists'), (snapshot) => {
      const list: Therapist[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Therapist);
      });
      markLoaded('therapists');
      setTherapists(list);
      localStorage.setItem('hka_therapists', JSON.stringify(list));
    }, (error) => {
      console.error("Therapists subscription error: ", error);
    });

    // 5. Products Real-time sync
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Product);
      });
      markLoaded('products');
      setProducts(list);
      localStorage.setItem('hka_products', JSON.stringify(list));
    }, (error) => {
      console.error("Products subscription error: ", error);
    });

    // 6. Expenses Real-time sync
    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snapshot) => {
      const list: Expense[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Expense);
      });
      markLoaded('expenses');
      setExpenses(list);
      localStorage.setItem('hka_expenses', JSON.stringify(list));
    }, (error) => {
      console.error("Expenses subscription error: ", error);
    });

    // 7. Attendance Real-time sync
    const unsubAttendance = onSnapshot(collection(db, 'attendance'), (snapshot) => {
      const list: Attendance[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Attendance);
      });
      markLoaded('attendance');
      setAttendance(list);
      localStorage.setItem('hka_attendance', JSON.stringify(list));
    }, (error) => {
      console.error("Attendance subscription error: ", error);
    });

    // 8. Services Real-time sync
    const unsubServices = onSnapshot(collection(db, 'services'), (snapshot) => {
      const list: Service[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as Service);
      });
      markLoaded('services');
      setServices(list);
      localStorage.setItem('hka_services', JSON.stringify(list));
    }, (error) => {
      console.error("Services subscription error: ", error);
    });

    return () => {
      unsubCustomers();
      unsubBookings();
      unsubTransactions();
      unsubTherapists();
      unsubProducts();
      unsubExpenses();
      unsubAttendance();
      unsubServices();
    };
  }, [user]);

  // Sync Firebase authentication state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch profile from Firestore
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const profileData = userSnap.data() as User;
            setUser(profileData);
            localStorage.setItem('hka_current_user', JSON.stringify(profileData));
          }
        } catch (err: any) {
          const isOffline = !navigator.onLine || (err && (err.code === 'unavailable' || String(err.message).toLowerCase().includes('offline')));
          if (isOffline) {
            console.warn("Client is offline, using locally cached user profile.");
            const saved = localStorage.getItem('hka_current_user');
            if (saved) {
              try {
                setUser(JSON.parse(saved));
              } catch (e) {
                // Ignore parsing errors
              }
            }
          } else {
            console.error("Error syncing profile with Firestore: ", err);
          }
        }
      } else {
        setUser(null);
        localStorage.removeItem('hka_current_user');
      }
    });
    return () => unsubscribe();
  }, []);

  // Synchronize usersList state with Firestore entries
  useEffect(() => {
    if (!user) return;
    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const loadedUsers: User[] = [];
        querySnapshot.forEach((doc) => {
          loadedUsers.push(doc.data() as User);
        });
        if (loadedUsers.length > 0) {
          setUsersList(loadedUsers);
        }
        // Mark 'users' loaded regardless of count, matching the other
        // collections' markLoaded pattern - otherwise dataReady would never
        // flip true and Sheets auto-sync would be blocked forever.
        markLoaded('users');
      } catch (err: any) {
        const isOffline = !navigator.onLine || (err && (err.code === 'unavailable' || String(err.message).toLowerCase().includes('offline')));
        if (isOffline) {
          console.warn("Client is offline, using locally cached users list.");
        } else {
          console.error("Error fetching users list from Firestore: ", err);
        }
      }
    };
    fetchUsers();
  }, [user]);

  // Auth helper
  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    localStorage.setItem('hka_current_user', JSON.stringify(loggedInUser));
    // Default branch selection to user branch
    setSelectedBranch(loggedInUser.branch);
    // Dynamic landing page default based on roles
    if (loggedInUser.role === 'SALON_MANAGER') {
      setActiveTab('pos');
    } else if (loggedInUser.role === 'THERAPIST') {
      setActiveTab('therapist-target');
    } else {
      setActiveTab('dashboard');
    }
  };

  // Keeps the in-memory session, localStorage cache, and the staff
  // directory list all in sync after a self-service avatar change - the
  // actual write to the database already happened in Sidebar.tsx.
  const handleUpdateOwnAvatar = (avatarUrl: string) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, avatar: avatarUrl };
      localStorage.setItem('hka_current_user', JSON.stringify(updated));
      return updated;
    });
    setUsersList(prev => prev.map(u => (u.id === user?.id ? { ...u, avatar: avatarUrl } : u)));
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (err) {
      console.error("Error signing out: ", err);
    }
    setUser(null);
    localStorage.removeItem('hka_current_user');
  };

  // ----------------------------------------------------
  // ENGINE REDUCERS / HANDLERS - MIGRATED TO FIRESTORE
  // ----------------------------------------------------

  // 1. Transaction creation (POS sale processed)
  const handleAddTransaction = async (
    newTx: Omit<Transaction, 'id' | 'date'>,
    invoiceDiscountValue: number = 0,
    invoiceDiscountType: 'percent' | 'flat' = 'flat',
    idempotencyKey?: string
  ): Promise<string> => {
    // id/date are placeholders only - the server assigns the authoritative
    // id and timestamp; callers should use the returned id, not this one.
    const completeTx: Transaction = {
      id: '',
      date: new Date().toISOString().substring(0, 19).replace('T', ' '),
      ...newTx
    };

    return addTransaction(
      completeTx,
      customers,
      products,
      therapists,
      invoiceDiscountValue,
      invoiceDiscountType,
      idempotencyKey
    );
  };

  // 2. Client registration (CRM addition)
  const handleAddCustomer = async (newCustomer: Omit<Customer, 'id' | 'totalSpend' | 'visitsCount'>) => {
    const newId = 'c' + (customers.length + 1);
    const customer: Customer = {
      id: newId,
      totalSpend: 0,
      visitsCount: 0,
      ...newCustomer
    };
    try {
      await addCustomer(customer);
    } catch (err) {
      console.error("Error registering customer in Firestore: ", err);
    }
  };

  // 2b. Mark an existing customer as a member (Basic tier) - done by a
  // kasir/therapist from CRM or POS. Optimistically updates local state so
  // the discount/tier badge shows immediately, rather than waiting for the
  // next onSnapshot poll cycle.
  const handleActivateMembership = async (customerId: string) => {
    try {
      const updated = await activateMembership(customerId);
      setCustomers(prev => prev.map(c => (c.id === customerId ? { ...c, ...updated } : c)));
    } catch (err) {
      console.error("Error activating membership: ", err);
      alert(err instanceof Error ? err.message : 'Gagal mengaktifkan membership. Silakan coba lagi.');
    }
  };

  const timeToMinutes = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const isBookingOverlap = (
    b1: { date: string; time: string; duration: number },
    b2: { date: string; time: string; duration: number }
  ): boolean => {
    if (b1.date !== b2.date) return false;

    const start1 = timeToMinutes(b1.time);
    const end1 = start1 + b1.duration;

    const start2 = timeToMinutes(b2.time);
    const end2 = start2 + b2.duration;

    return start1 < end2 && start2 < end1;
  };

  // 3. Appointment creation (Booking added)
  const handleAddBooking = async (newBooking: Omit<Booking, 'id'>) => {
    const hasOverlap = bookings.some(b => 
      b.therapistId === newBooking.therapistId &&
      b.branch === newBooking.branch &&
      b.date === newBooking.date &&
      (b.status === 'pending' || b.status === 'checked_in') &&
      isBookingOverlap(newBooking, b)
    );

    if (hasOverlap) {
      // Previously this only logged a console.warn and returned - the
      // caller (Bookings.tsx) had no way to know the booking was rejected,
      // so the form reset and the drawer closed as if it had succeeded.
      throw new Error(
        `Terapis ${newBooking.therapistName} sudah memiliki jadwal yang bentrok pada slot waktu ini.`
      );
    }

    // The id here is only a client-side placeholder for the overlap check
    // above; the server assigns and returns the real _id (see
    // server/controllers/recordsController.ts createBooking).
    const bookingId = 'b' + (bookings.length + 1);
    const booking: Booking = {
      id: bookingId,
      ...newBooking
    };
    // Let errors (validation failures, network errors, auth failures)
    // propagate to the caller instead of being swallowed here - Bookings.tsx
    // now awaits this and shows the message via generalError. Previously
    // this try/catch only did console.error, so a failed save looked
    // identical to a successful one from the user's perspective.
    const created = await addBooking(booking);
    setBookings(prev => [...prev, created]);
  };

  // 4. Booking Status Modification
  const handleUpdateBookingStatus = async (
    id: string, 
    status: 'pending' | 'checked_in' | 'completed' | 'cancelled'
  ) => {
    if (status === 'checked_in') {
      const targetBooking = bookings.find(b => b.id === id);
      if (targetBooking) {
        const hasOverlap = bookings.some(b => 
          b.id !== targetBooking.id &&
          b.therapistId === targetBooking.therapistId &&
          b.branch === targetBooking.branch &&
          b.date === targetBooking.date &&
          (b.status === 'pending' || b.status === 'checked_in') &&
          isBookingOverlap(targetBooking, b)
        );
        if (hasOverlap) {
          console.warn("Prevented checked_in state due to overlap.");
          return;
        }
      }
    }

    const target = bookings.find(b => b.id === id);
    if (!target) return;

    let transactionToAutoAdd: Omit<Transaction, 'id' | 'date'> | undefined = undefined;
    if (status === 'completed' && target.status !== 'completed') {
      transactionToAutoAdd = {
        customerName: target.customerName,
        branch: target.branch,
        items: [
          {
            id: target.serviceId,
            name: target.serviceName,
            price: target.price,
            quantity: 1,
            type: 'service',
            therapistId: target.therapistId
          }
        ],
        subtotal: target.price,
        discount: 0,
        total: target.price,
        paymentMethod: 'card', // assume fallback credit payment
        cashierName: user?.name || 'System Auto'
      };
    }

    try {
      await updateBookingStatus(id, status, transactionToAutoAdd, customers, products, therapists);
    } catch (err) {
      console.error("Error updating booking status in Firestore: ", err);
    }
  };

  // 5. Restock products (ERP Inventory)
  const handleRestockProduct = async (id: string, amount: number) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    try {
      await restockProduct(id, amount, prod.stock);
    } catch (err) {
      console.error("Error restocking product in Firestore: ", err);
    }
  };

  // 6. Expenditure tracking (ERP Outflows)
  const handleAddExpense = async (newExpense: Omit<Expense, 'id'>) => {
    const expId = 'e' + (expenses.length + 1);
    const expense: Expense = {
      id: expId,
      ...newExpense
    };
    try {
      await addExpense(expense);
    } catch (err) {
      console.error("Error logging expense to Firestore: ", err);
    }
  };

  // 7. Attendance Clock In & Manual Log
  const handleAddAttendance = async (newAtt: Omit<Attendance, 'id'>) => {
    const attId = 'att-' + Math.floor(Math.random() * 9000 + 1000);
    const attendanceRecord: Attendance = {
      id: attId,
      ...newAtt
    };
    try {
      await addAttendance(attendanceRecord);
    } catch (err) {
      console.error("Error logging attendance to Firestore: ", err);
    }
  };

  // 8. Attendance Clock Out Update
  const handleUpdateAttendance = async (id: string, clockOut: string, notes?: string) => {
    try {
      await updateAttendance(id, clockOut, notes);
    } catch (err) {
      console.error("Error clocking out attendance in Firestore: ", err);
    }
  };

  // Switch renderer depending on tab state
  const renderActiveModule = () => {
    if (!user) return null;
    
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            user={user}
            selectedBranch={selectedBranch}
            transactions={transactions}
            bookings={bookings}
            therapists={therapists}
            products={products}
            onUpdateBookingStatus={handleUpdateBookingStatus}
          />
        );
      case 'pos':
        return (
          <POS
            user={user}
            selectedBranch={selectedBranch}
            customers={customers}
            services={services}
            products={products}
            therapists={therapists}
            users={usersList}
            onAddTransaction={handleAddTransaction}
            onAddCustomer={handleAddCustomer}
            onActivateMembership={handleActivateMembership}
          />
        );
      case 'bookings':
        return (
          <Bookings
            user={user}
            selectedBranch={selectedBranch}
            bookings={bookings}
            customers={customers}
            services={services}
            therapists={therapists}
            onAddBooking={handleAddBooking}
            onUpdateBookingStatus={handleUpdateBookingStatus}
          />
        );
      case 'erp':
        return (
          <ERP
            user={user}
            selectedBranch={selectedBranch}
            products={products}
            therapists={therapists}
            expenses={expenses}
            onRestockProduct={handleRestockProduct}
            onAddExpense={handleAddExpense}
            usersList={usersList}
            onAddUser={(newUser) => {
              setUsersList(prev => [...prev, newUser]);
            }}
            onDeleteUser={async (userId) => {
              try {
                await deleteDoc(doc(db, 'users', userId));
                setUsersList(prev => prev.filter(u => u.id !== userId));
              } catch (err) {
                console.error("Error deleting user from Firestore: ", err);
              }
            }}
            onUpdateUserRole={async (userId, role, branch) => {
              await updateDoc(doc(db, 'users', userId), { role, branch });
              setUsersList(prev => prev.map(u => (u.id === userId ? { ...u, role, branch } : u)));
            }}
            onAddTherapist={async (newTherapist) => {
              const created = await addTherapist(newTherapist);
              setTherapists(prev => [...prev, created]);
            }}
          />
        );
      case 'crm':
        return (
          <CRM
            user={user}
            selectedBranch={selectedBranch}
            customers={customers}
            onAddCustomer={handleAddCustomer}
            onActivateMembership={handleActivateMembership}
          />
        );
      case 'attendance':
        return (
          <AttendanceComponent
            user={user}
            selectedBranch={selectedBranch}
            attendance={attendance}
            onAddAttendance={handleAddAttendance}
            onUpdateAttendance={handleUpdateAttendance}
          />
        );
      case 'attendance-terminal':
        return (
          <AttendanceTerminal
            user={user}
            attendance={attendance}
            onAddAttendance={handleAddAttendance}
            onUpdateAttendance={handleUpdateAttendance}
          />
        );
      case 'therapist-target':
        return (
          <TherapistTarget
            user={user}
            therapists={therapists}
            transactions={transactions}
          />
        );
      case 'payroll':
        return (
          <PayrollComponent
            user={user}
            selectedBranch={selectedBranch}
          />
        );
      case 'my-payroll':
        return (
          <MyPayroll
            user={user}
          />
        );
      case 'branch-settings':
        return (
          <BranchSettings />
        );
      default:
        return null;
    }
  };

  // If user is not authenticated, serve premium login page
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} usersList={usersList} />;
  }

  return (
    <div id="hka-root" className="min-h-screen bg-[#f8f6f2] flex overflow-hidden font-sans">
      
      {/* Central control sidebar */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedBranch={selectedBranch}
        setSelectedBranch={setSelectedBranch}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onUpdateOwnAvatar={handleUpdateOwnAvatar}
      />

      {/* Main interactive viewport container */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Top Operational Status Ribbon */}
        <header id="hka-topbar" className="h-16 bg-white border-b border-slate-200/60 px-4 md:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              id="mobile-menu-toggle"
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-1 rounded-xl text-slate-500 hover:bg-slate-100 lg:hidden cursor-pointer"
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-sm font-bold text-slate-800 font-serif capitalize">{activeTab} Panel</h2>
              <span className="text-[10px] text-slate-400 font-mono">
                Branch: {selectedBranch === 'ALL' ? 'All Corporate Branches' : selectedBranch.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <GoogleSheetsSync
              customers={customers}
              bookings={bookings}
              transactions={transactions}
              therapists={therapists}
              products={products}
              services={services}
              expenses={expenses}
              attendance={attendance}
              users={usersList}
              onDataLoaded={(data) => {
                setCustomers(data.customers);
                setBookings(data.bookings);
                setTransactions(data.transactions);
                setTherapists(data.therapists);
                setProducts(data.products);
                setServices(data.services);
                setExpenses(data.expenses);
                setAttendance(data.attendance);
                if (data.users && data.users.length > 0) {
                  setUsersList(data.users);
                }
              }}
              currentUser={user}
              dataReady={dataReady}
            />
            <span className="text-xs text-slate-500 font-mono bg-slate-50 border border-slate-100 px-3 py-1 rounded-full hidden sm:inline-block">
              System Time: 19:07 UTC
            </span>
          </div>
        </header>

        {/* Core content stage */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {renderActiveModule()}
        </main>
      </div>
    </div>
  );
}
