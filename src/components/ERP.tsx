import React, { useState, useMemo } from 'react';
import { createUserWithEmailAndPassword } from '../lib/authClient';
import { doc, setDoc } from '../lib/firestoreClient';
import { auth, secondaryAuth, db } from '../lib/firebase';
import { User, Branch, Product, Therapist, Expense, Role } from '../types';
import { formatIDR } from '../utils';
import { 
  Package, 
  Users, 
  DollarSign, 
  Plus, 
  AlertTriangle, 
  CheckCircle, 
  ShieldAlert, 
  Key, 
  Trash2, 
  UserCheck,
  Loader2
} from 'lucide-react';

interface ERPProps {
  user: User;
  selectedBranch: Branch;
  products: Product[];
  therapists: Therapist[];
  expenses: Expense[];
  onRestockProduct: (id: string, amount: number) => void;
  onAddExpense: (expense: Omit<Expense, 'id'>) => void;
  usersList: User[];
  onAddUser: (newUser: User) => void;
  onDeleteUser: (userId: string) => void;
  onAddTherapist: (therapist: {
    name: string;
    branch: Exclude<Branch, 'ALL'>;
    specialties?: string[];
    linkedUserId?: string;
  }) => Promise<void>;
}

export default function ERP({
  user,
  selectedBranch,
  products,
  therapists,
  expenses,
  onRestockProduct,
  onAddExpense,
  usersList,
  onAddUser,
  onDeleteUser,
  onAddTherapist
}: ERPProps) {
  const [erpTab, setErpTab] = useState<'inventory' | 'staff' | 'expenses'>('inventory');

  // Filter lists based on the active dashboard branch selector
  const activeBranchFilter = user.role === 'SALON_MANAGER' ? user.branch : selectedBranch;

  const filteredProducts = useMemo(() => {
    if (activeBranchFilter === 'ALL') return products;
    return products.filter(p => p.branch === activeBranchFilter);
  }, [products, activeBranchFilter]);

  const filteredTherapists = useMemo(() => {
    if (activeBranchFilter === 'ALL') return therapists;
    return therapists.filter(t => t.branch === activeBranchFilter);
  }, [therapists, activeBranchFilter]);

  const filteredExpenses = useMemo(() => {
    if (activeBranchFilter === 'ALL') return expenses;
    return expenses.filter(e => e.branch === activeBranchFilter);
  }, [expenses, activeBranchFilter]);

  // Expenses Logger State
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseBranch, setExpenseBranch] = useState<'NAO_STUDIO' | 'DIAEL_BEAUTY'>(
    user.branch === 'ALL' ? 'NAO_STUDIO' : user.branch as 'NAO_STUDIO' | 'DIAEL_BEAUTY'
  );
  const [expenseCategory, setExpenseCategory] = useState<'Rent' | 'Utilities' | 'Supplies' | 'Marketing' | 'Salaries' | 'Other'>('Supplies');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseDescription, setExpenseDescription] = useState('');

  // Personnel Account registration state
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('THERAPIST');
  const [newUserBranch, setNewUserBranch] = useState<Branch>('NAO_STUDIO');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserAvatar, setNewUserAvatar] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');

  // Password reset states
  const [tempPasswordModalText, setTempPasswordModalText] = useState<string | null>(null);
  const [tempPasswordModalUser, setTempPasswordModalUser] = useState<string | null>(null);
  const [resettingInProgress, setResettingInProgress] = useState(false);

  const handleResetPassword = async (userId: string, userName: string) => {
    const confirmReset = window.confirm(`Apakah Anda yakin ingin menyetel ulang password untuk ${userName}?`);
    if (!confirmReset) return;

    setResettingInProgress(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        alert("Sesi Anda kedaluwarsa. Silakan masuk kembali.");
        return;
      }

      const response = await fetch('/api/resetStaffPassword', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ uid: userId })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Gagal menyetel ulang password.');
      }

      setTempPasswordModalText(resData.tempPassword);
      setTempPasswordModalUser(userName);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Gagal menyetel ulang password.');
    } finally {
      setResettingInProgress(false);
    }
  };

  const handleLogExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseAmount <= 0 || !expenseDescription) return;

    onAddExpense({
      branch: expenseBranch,
      category: expenseCategory,
      amount: expenseAmount,
      date: expenseDate,
      description: expenseDescription
    });

    setExpenseAmount(0);
    setExpenseDescription('');
    setShowAddExpense(false);
  };

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registering) return; // prevent double-submit from a double-tap/click racing the disabled state
    if (!newUserName || !newUserUsername || !newUserEmail || !newUserPassword) {
      setRegisterError('All required fields must be completed.');
      return;
    }
    if (newUserPassword.length < 6) {
      setRegisterError('Password must be at least 6 characters.');
      return;
    }

    setRegistering(true);
    setRegisterError('');

    try {
      // Create user inside our secondary auth instance so we don't log out current admin session
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail.trim(), newUserPassword);
      const firebaseUser = userCredential.user;

      const randomAvatarNum = Math.floor(Math.random() * 70);
      const fallbackAvatar = `https://i.pravatar.cc/150?img=${randomAvatarNum}`;

      const newUser: User = {
        id: firebaseUser.uid,
        name: newUserName.trim(),
        username: newUserUsername.toLowerCase().trim().replace(/\s+/g, '_'),
        role: newUserRole,
        branch: newUserBranch,
        email: newUserEmail.trim().toLowerCase(),
        avatar: newUserAvatar || fallbackAvatar
      };

      // Write to Firestore db users collection. Must be a merge write: the
      // account was just created with a passwordHash by /api/auth/register
      // (via createUserWithEmailAndPassword above), and a non-merge setDoc
      // does a full document replace server-side - since `newUser` here has
      // no passwordHash field, a plain setDoc would silently wipe the
      // password that was just set, locking the new staff account out on
      // its very first login attempt. (Same bug, same fix, as the
      // self-registration flow in src/components/Login.tsx.)
      await setDoc(doc(db, 'users', firebaseUser.uid), newUser, { merge: true });

      // Add to current client-side state
      onAddUser(newUser);

      // A THERAPIST login account on its own doesn't make someone
      // schedulable - Bookings/POS and the Therapists Google Sheet tab all
      // read from the separate Therapist collection, not Users. Without
      // this, a newly registered therapist could log in but would never
      // show up anywhere staff actually assign work from.
      if (newUserRole === 'THERAPIST') {
        try {
          await onAddTherapist({
            name: newUserName.trim(),
            branch: newUserBranch,
            specialties: []
          });
        } catch (therapistErr) {
          console.error('Failed to create matching Therapist record: ', therapistErr);
          setRegisterError(
            `Akun login untuk ${newUserName.trim()} berhasil dibuat, tapi gagal membuat data Therapist (untuk jadwal/booking). ` +
            `Tambahkan manual lewat tab Therapists di Google Sheet, atau coba lagi.`
          );
        }
      }

      // Reset Form
      setNewUserName('');
      setNewUserUsername('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserAvatar('');
      setShowAddUserForm(false);
    } catch (err: any) {
      console.error("Staff registration failed: ", err);
      if (err.code === 'auth/email-already-in-use') {
        setRegisterError('This email is already in use by another staff account.');
      } else if (err.code === 'auth/weak-password') {
        setRegisterError('The chosen password is too weak.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setRegisterError("Email/Password provider is disabled in Firebase. Please go to the Firebase Console -> Build -> Authentication -> Sign-in Method, and enable 'Email/Password' provider.");
      } else {
        setRegisterError(err.message || 'Registration failed. Please verify credentials.');
      }
    } finally {
      setRegistering(false);
    }
  };

  const totalExpenseSum = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  return (
    <div id="erp-module" className="space-y-6">
      
      {/* Header & Internal Nav */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
        {/* Module Title */}
        <div>
          <h2 className="text-lg font-bold text-slate-800 font-serif">Enterprise Resource Planning (ERP)</h2>
          <p className="text-xs text-slate-400">Manage products, staff profiles, credentials, and central salon ledgers.</p>
        </div>

        {/* Tab switch buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
          <button
            onClick={() => setErpTab('inventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
              erpTab === 'inventory' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Inventory</span>
          </button>
          <button
            onClick={() => setErpTab('staff')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
              erpTab === 'staff' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Personnel</span>
          </button>
          <button
            onClick={() => setErpTab('expenses')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
              erpTab === 'expenses' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Ledger</span>
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------
          TAB 1: INVENTORY CONTROL
          ---------------------------------------------------- */}
      {erpTab === 'inventory' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Product Inventory Log</h3>
              <p className="text-xs text-slate-400 mt-0.5">Alerts trigger when products fall below safe thresholds.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                  <th className="py-3 px-4">Product details</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4">Retail Price</th>
                  <th className="py-3 px-4">Cost Price</th>
                  <th className="py-3 px-4 text-center">Stock status</th>
                  <th className="py-3 px-4 text-right">Supply Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {filteredProducts.map((p) => {
                  const isLow = p.stock <= p.minStock;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-all">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{p.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {p.sku} • {p.category}</div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {p.branch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800">{formatIDR(p.price)}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">{formatIDR(p.cost)}</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-mono ${
                          isLow ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800'
                        }`}>
                          {isLow ? <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" /> : <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />}
                          <span>{p.stock} units</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onRestockProduct(p.id, 5)}
                            className="bg-slate-100 hover:bg-[#FDFBF7] hover:border-[#D4AF37]/50 text-slate-700 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 cursor-pointer transition-all shrink-0"
                          >
                            +5 Restock
                          </button>
                          <button
                            onClick={() => onRestockProduct(p.id, 20)}
                            className="bg-[#1a1c1e] hover:bg-slate-800 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all shrink-0"
                          >
                            +20 Bulk
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          TAB 2: PERSONNEL & STAFF TRACKER
          ---------------------------------------------------- */}
      {erpTab === 'staff' && (
        <div className="space-y-8">
          
          {/* Section A: Licensed Salon Therapists */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Licensed Salon Therapists</h3>
              <p className="text-xs text-slate-400 mt-0.5">Review specialty fields, client satisfaction ranks, and earned therapist commissions.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTherapists.map((t) => (
                <div key={t.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between hover:shadow-xs transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-bold font-serif shadow-xs shrink-0">
                        {t.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{t.name}</h4>
                        <p className="text-[10px] font-mono text-[#D4AF37] mt-0.5 uppercase">
                          {t.branch === 'NAO_STUDIO' ? 'NAO Studio • Hair & Nails' : 'DIAEL Beauty • Lashes & Spa'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[9px] font-mono font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded uppercase">
                      {t.status}
                    </span>
                  </div>

                  <div className="my-3 pt-3 border-t border-slate-200/50">
                    <span className="text-[9px] text-slate-400 font-mono block uppercase">Therapy Specialties</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.specialties.map((spec, i) => (
                        <span key={i} className="text-[9px] font-medium bg-white text-slate-600 border border-slate-200/80 px-2 py-0.5 rounded-md">
                          {spec}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-200/50 flex items-center justify-between text-xs font-semibold">
                    <div className="text-slate-500 font-mono">
                      Rating: <span className="text-slate-800 font-bold font-sans">★ {t.rating}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] text-slate-400 font-mono block">COMMISSION RATE: {(t.commissionRate * 100).toFixed(0)}%</span>
                      <span className="text-slate-900 font-bold font-mono">Earned Payout: {formatIDR(t.totalCommissionEarned)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section B: Personnel System Access Credentials */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
                  <Key className="w-4 h-4 text-[#D4AF37]" />
                  Personnel Access & Credentials Database
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Operational account registry for every tier (HQ, Salon Managers, and Active Therapists).</p>
              </div>

              {user.role === 'HKA_MANAGEMENT' && (
                <button
                  onClick={() => setShowAddUserForm(!showAddUserForm)}
                  className="bg-[#1a1c1e] hover:bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Register Personnel</span>
                </button>
              )}
            </div>

            {showAddUserForm && (
              <div className="bg-slate-50/50 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200/40">
                  <UserCheck className="w-4 h-4 text-[#D4AF37]" />
                  <span className="text-xs font-bold text-slate-800">Register New Staff Profile & Login</span>
                </div>

                <form onSubmit={handleRegisterUser} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[9px] text-slate-400 font-mono block mb-1">FULL NAME</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rachel Chen"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-400 font-mono block mb-1">USERNAME (LOGIN ID)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. rachel_chen"
                      value={newUserUsername}
                      onChange={(e) => setNewUserUsername(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-400 font-mono block mb-1">EMAIL ADDRESS</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. rachel@naostudio.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-400 font-mono block mb-1">LOGIN PASSWORD</label>
                    <input
                      type="password"
                      required
                      placeholder="Min 6 characters"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-400 font-mono block mb-1">AUTHORIZATION TIER / ROLE</label>
                    <select
                      value={newUserRole}
                      onChange={(e: any) => setNewUserRole(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 focus:outline-none"
                    >
                      <option value="HKA_MANAGEMENT">HKA Management (HQ Admin)</option>
                      <option value="SALON_MANAGER">Salon Manager (POS Operator)</option>
                      <option value="THERAPIST">Salon Therapist (Target & Attendance)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-400 font-mono block mb-1">ASSIGNED JURISDICTION</label>
                    <select
                      value={newUserBranch}
                      onChange={(e: any) => setNewUserBranch(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 focus:outline-none"
                    >
                      <option value="NAO_STUDIO">NAO Studio</option>
                      <option value="DIAEL_BEAUTY">DIAEL Beauty</option>
                      <option value="ALL">All Branches (Corporate HQ Only)</option>
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="text-[9px] text-slate-400 font-mono block mb-1">AVATAR URL (OPTIONAL)</label>
                    <input
                      type="text"
                      placeholder="Leave blank for auto-avatar"
                      value={newUserAvatar}
                      onChange={(e) => setNewUserAvatar(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>

                  {registerError && (
                    <div className="md:col-span-3 text-xs font-semibold text-rose-500 bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl">
                      {registerError}
                    </div>
                  )}

                  <div className="md:col-span-3 flex justify-end gap-2 pt-2 border-t border-slate-200/40">
                    <button
                      type="button"
                      disabled={registering}
                      onClick={() => setShowAddUserForm(false)}
                      className="px-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={registering}
                      className="px-4 py-2 bg-[#1a1c1e] text-[#D4AF37] font-bold rounded-xl text-xs hover:bg-slate-800 cursor-pointer disabled:bg-slate-400 disabled:text-slate-200 flex items-center gap-1.5"
                    >
                      {registering ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Creating Auth Account...</span>
                        </>
                      ) : (
                        <span>Confirm Registration</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                    <th className="py-3 px-4">Operator</th>
                    <th className="py-3 px-4">Username ID</th>
                    <th className="py-3 px-4">Authorization Tier</th>
                    <th className="py-3 px-4">Jurisdiction</th>
                    <th className="py-3 px-4">Email Address</th>
                    {user.role === 'HKA_MANAGEMENT' && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {usersList.map((usr) => (
                    <tr key={usr.id} className="hover:bg-slate-50/50 transition-all">
                      <td className="py-3 px-4 flex items-center gap-2.5">
                        <img
                          src={usr.avatar || `https://i.pravatar.cc/150?u=${usr.username}`}
                          alt={usr.name}
                          className="w-7 h-7 rounded-full object-cover border border-slate-100 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <span className="font-bold text-slate-800">{usr.name}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] text-[#D4AF37] bg-amber-50/60 border border-amber-100/50 px-2 py-0.5 rounded font-bold">
                          @{usr.username}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase font-mono ${
                          usr.role === 'HKA_MANAGEMENT' 
                            ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                            : usr.role === 'SALON_MANAGER' 
                            ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                            : 'bg-slate-100 text-slate-800 border border-slate-200'
                        }`}>
                          {usr.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-600">
                        {usr.branch === 'ALL' ? 'HQ Corporate' : usr.branch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {usr.email}
                      </td>
                      {user.role === 'HKA_MANAGEMENT' && (
                        <td className="py-3 px-4 text-right">
                          {usr.id === user.id ? (
                            <span className="text-[10px] text-slate-400 font-mono">Active self</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleResetPassword(usr.id, usr.name)}
                                disabled={resettingInProgress}
                                className="text-slate-400 hover:text-amber-600 p-1 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer flex items-center justify-center"
                                title="Reset staff password"
                              >
                                {resettingInProgress ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                                ) : (
                                  <Key className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  const confirmDelete = window.confirm(`Are you sure you want to revoke system credentials for ${usr.name}?`);
                                  if (confirmDelete) {
                                    onDeleteUser(usr.id);
                                  }
                                }}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Revoke operator credentials"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          TAB 3: CENTRAL FINANCIAL LEDGER & EXPENSES
          ---------------------------------------------------- */}
      {erpTab === 'expenses' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Expenses Register Feed */}
          <div className="xl:col-span-7 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Ledger Expense Registry</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Track cross-branch expenditures.</p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-400 font-mono block">TOTAL OUTFLOW</span>
                  <span className="text-sm font-extrabold text-slate-900 font-mono">{formatIDR(totalExpenseSum)}</span>
                </div>
              </div>

              {filteredExpenses.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">No expenses logged in this branch.</div>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-[350px] pr-1">
                  {filteredExpenses.map((exp) => (
                    <div key={exp.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">{exp.description}</span>
                          <span className="text-[8px] font-mono font-bold bg-slate-200 text-slate-700 px-1 rounded uppercase">
                            {exp.branch === 'NAO_STUDIO' ? 'NAO' : 'DIAEL'}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">{exp.category} • {exp.date}</span>
                      </div>
                      <span className="text-xs font-bold font-mono text-rose-500 font-bold">-{formatIDR(exp.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Log New Expense Module */}
          <div className="xl:col-span-5 bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono mb-4">Log Outflow Expenditure</h3>
            
            <form onSubmit={handleLogExpense} className="space-y-3">
              {user.role === 'HKA_MANAGEMENT' ? (
                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">ALLOCATED BRANCH</label>
                  <select
                    value={expenseBranch}
                    onChange={(e: any) => setExpenseBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 focus:outline-none"
                  >
                    <option value="NAO_STUDIO">NAO Studio (Hair & Nails)</option>
                    <option value="DIAEL_BEAUTY">DIAEL Beauty (Lashes & Spa)</option>
                  </select>
                </div>
              ) : (
                <div className="text-xs font-semibold text-slate-500 bg-slate-50 p-2 rounded-xl">
                  Branch locked: <span className="text-slate-800 font-bold">{user.branch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty'}</span>
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">EXPENSE CATEGORY</label>
                <select
                  value={expenseCategory}
                  onChange={(e: any) => setExpenseCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 focus:outline-none"
                >
                  <option value="Rent">Rent & Lease</option>
                  <option value="Utilities">Utilities & Water</option>
                  <option value="Supplies">Supplies & Cosmetics</option>
                  <option value="Marketing">Social & Marketing</option>
                  <option value="Salaries">Staff Salaries</option>
                  <option value="Other">Other Expenses</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">AMOUNT (Rp)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={expenseAmount || ''}
                    onChange={(e) => setExpenseAmount(Number(e.target.value))}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">DATE OF RECORD</label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-2 py-2 text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">DESCRIPTION DETAILS</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Purchase of organic oils & lashes pack"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#1a1c1e] hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 mt-4 shadow-sm"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                <span>Log Expenditure</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Temporary Password Reset Modal (Shown Once) */}
      {tempPasswordModalText && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 border border-slate-100 shadow-2xl space-y-4 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <Key className="w-6 h-6 text-amber-600" />
            </div>
            
            <div>
              <h3 className="text-base font-bold text-slate-800">Password Sementara Dibuat</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Password sementara untuk <strong>{tempPasswordModalUser}</strong> telah berhasil dibuat.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 select-all cursor-pointer group hover:bg-slate-100/70 transition-all">
              <span className="text-xs text-slate-400 block mb-1 uppercase font-mono font-semibold tracking-wider">Password Sementara</span>
              <span className="text-lg font-mono font-extrabold text-slate-800 tracking-wider block">{tempPasswordModalText}</span>
              <span className="text-[10px] text-[#D4AF37] block mt-1.5 font-sans font-medium">Klik/pilih teks di atas untuk menyalin</span>
            </div>

            <p className="text-[10px] text-rose-500 font-medium leading-relaxed bg-rose-50 border border-rose-100/50 p-2.5 rounded-xl">
              PENTING: Simpan password ini sekarang. Password ini hanya ditampilkan SEKALI ini saja demi alasan keamanan.
            </p>

            <button
              onClick={() => {
                setTempPasswordModalText(null);
                setTempPasswordModalUser(null);
              }}
              className="w-full bg-[#1a1c1e] hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl cursor-pointer transition-all shadow-md"
            >
              Saya sudah mencatat password
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
