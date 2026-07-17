import { useState, useMemo } from 'react';
import { User, Branch, Transaction, Booking, Therapist, Product } from '../types';
import { formatIDR } from '../utils';
import {   TrendingUp, 
  ShoppingBag, 
  Calendar, 
  Sparkles, 
  AlertTriangle,
  Award,
  CircleDollarSign,
  UserCheck,
  CheckCircle2,
  Clock,
  Briefcase,
  Target
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  CartesianGrid 
} from 'recharts';

interface DashboardProps {
  user: User;
  selectedBranch: Branch;
  transactions: Transaction[];
  bookings: Booking[];
  therapists: Therapist[];
  products: Product[];
  onUpdateBookingStatus: (id: string, status: 'pending' | 'checked_in' | 'completed' | 'cancelled') => void;
}

// Shared "my therapist stats" view - used both as the full dashboard for a
// THERAPIST-role login, and as an optional toggled-in panel for a
// SALON_MANAGER who also has a linked Therapist profile (dual-role staff
// who sometimes perform services themselves). Identical content either
// way; only who gets to see it differs.
function TherapistStatsPanel({
  user,
  therapistProfile,
  bookings,
  onUpdateBookingStatus
}: {
  user: User;
  therapistProfile: Therapist;
  bookings: Booking[];
  onUpdateBookingStatus: DashboardProps['onUpdateBookingStatus'];
}) {
  const personalBookings = bookings.filter(b => b.therapistId === therapistProfile.id);
  const completedBookingsCount = personalBookings.filter(b => b.status === 'completed').length;
  const pendingBookingsCount = personalBookings.filter(b => b.status === 'pending').length;

  return (
    <div id="therapist-dashboard" className="space-y-6">
      {/* Header Hero card */}
      <div className="bg-gradient-to-r from-[#1a1c1e] to-slate-800 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 border border-slate-700/30">
        <div className="flex items-center gap-4">
          <img 
            src={user.avatar} 
            alt={user.name} 
            className="w-16 h-16 rounded-2xl object-cover ring-2 ring-[#D4AF37]"
            referrerPolicy="no-referrer"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-serif font-bold text-[#D4AF37]">{user.name}</h1>
              <span className="text-[10px] bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/30 px-2 py-0.5 rounded-full font-mono uppercase">
                Active
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Therapist Portfolio • {user.branch === 'NAO_STUDIO' ? 'NAO Studio (Hair & Nails)' : 'DIAEL Beauty (Lashes & Skincare)'}
            </p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="bg-white/10 px-4 py-3 rounded-2xl border border-white/5 backdrop-blur">
            <span className="text-[9px] font-mono text-slate-300 uppercase block">My Rating</span>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-base font-bold text-[#D4AF37]">{therapistProfile.rating}</span>
              <span className="text-xs text-slate-400">/ 5.0</span>
            </div>
          </div>
          <div className="bg-white/10 px-4 py-3 rounded-2xl border border-white/5 backdrop-blur">
            <span className="text-[9px] font-mono text-slate-300 uppercase block">Earned Commission</span>
            <span className="text-base font-bold text-emerald-400 mt-1 block">{formatIDR(therapistProfile.totalCommissionEarned)}</span>
          </div>
        </div>
      </div>

      {/* Quick Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block font-mono">My Bookings</span>
            <span className="text-2xl font-bold text-slate-900 mt-1 block">{personalBookings.length}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-[#D4AF37]" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block font-mono">Completed Jobs</span>
            <span className="text-2xl font-bold text-emerald-600 mt-1 block">{completedBookingsCount}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block font-mono">Pending Jobs</span>
            <span className="text-2xl font-bold text-amber-600 mt-1 block">{pendingBookingsCount}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 block font-mono">Commission Rate</span>
            <span className="text-2xl font-bold text-slate-800 mt-1 block">{(therapistProfile.commissionRate * 100).toFixed(0)}%</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <CircleDollarSign className="w-5 h-5 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Schedule & Active Tasks */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-serif">Today's Active Agenda</h2>
            <p className="text-xs text-slate-500">Track and check-in salon clients booked with you.</p>
          </div>
          <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-bold">
            Sunday, July 12, 2026
          </span>
        </div>

        {personalBookings.length === 0 ? (
          <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <p className="text-sm text-slate-500">No appointments scheduled for you today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {personalBookings.map((b) => (
              <div 
                key={b.id} 
                className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  b.status === 'completed' 
                    ? 'bg-emerald-50/20 border-emerald-100/80' 
                    : b.status === 'cancelled' 
                    ? 'bg-slate-50 border-slate-200 opacity-60' 
                    : b.status === 'checked_in'
                    ? 'bg-amber-50/20 border-amber-200/80 ring-1 ring-amber-400/20'
                    : 'bg-white border-slate-100 hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 flex flex-col items-center justify-center border border-slate-100 shrink-0">
                    <span className="text-xs font-bold text-[#D4AF37] font-mono leading-none">{b.time}</span>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">{b.duration}m</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{b.customerName}</h4>
                      <span className={`text-[8px] font-mono uppercase font-bold px-2 py-0.5 rounded-full ${
                        b.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                        b.status === 'checked_in' ? 'bg-amber-100 text-amber-800' :
                        b.status === 'cancelled' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {b.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium mt-1">{b.serviceName}</p>
                    {b.notes && <p className="text-[10px] text-slate-400 italic mt-0.5">Note: "{b.notes}"</p>}
                  </div>
                </div>

                {/* Actions for therapists to update status */}
                <div className="flex items-center gap-2 justify-end self-end md:self-center">
                  {b.status === 'pending' && (
                    <button
                      onClick={() => onUpdateBookingStatus(b.id, 'checked_in')}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold rounded-lg shadow-sm cursor-pointer transition-all"
                    >
                      Check In Client
                    </button>
                  )}
                  {b.status === 'checked_in' && (
                    <button
                      onClick={() => onUpdateBookingStatus(b.id, 'completed')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shadow-sm cursor-pointer transition-all"
                    >
                      Complete Session
                    </button>
                  )}
                  {b.status !== 'completed' && b.status !== 'cancelled' && (
                    <button
                      onClick={() => onUpdateBookingStatus(b.id, 'cancelled')}
                      className="px-2 py-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 text-[11px] font-medium rounded-lg cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  )}
                  {b.status === 'completed' && (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Added to payout
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Therapist Specialties Profile Card */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono mb-3">My Specialties Profile</h3>
        <div className="flex flex-wrap gap-2">
          {therapistProfile.specialties.map((spec, idx) => (
            <span key={idx} className="bg-amber-50 text-[#D4AF37] border border-amber-100 text-xs px-3 py-1 rounded-full font-medium shadow-xs">
              {spec}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Small pill switcher shown to a dual-role Salon Manager (one who also has
// a linked Therapist profile) so they can flip between their branch
// management dashboard and their personal "as a therapist" stats, without
// switching accounts or logging out - they stay logged in as Manager the
// whole time, this only changes which view of the data they're looking at.
function DualRoleViewToggle({
  dashboardView,
  setDashboardView
}: {
  dashboardView: 'manager' | 'therapist';
  setDashboardView: (v: 'manager' | 'therapist') => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm w-fit">
      <span className="text-[10px] text-slate-400 font-mono uppercase px-2">Tampilan:</span>
      <button
        onClick={() => setDashboardView('manager')}
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
          dashboardView === 'manager'
            ? 'bg-[#1a1c1e] text-[#D4AF37]'
            : 'text-slate-500 hover:bg-slate-50'
        }`}
      >
        Manager
      </button>
      <button
        onClick={() => setDashboardView('therapist')}
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
          dashboardView === 'therapist'
            ? 'bg-[#1a1c1e] text-[#D4AF37]'
            : 'text-slate-500 hover:bg-slate-50'
        }`}
      >
        Therapist Saya
      </button>
    </div>
  );
}

export default function Dashboard({
  user,
  selectedBranch,
  transactions,
  bookings,
  therapists,
  products,
  onUpdateBookingStatus
}: DashboardProps) {
  const isTherapist = user.role === 'THERAPIST';

  // Dual-role staff: a SALON_MANAGER who sometimes also performs services
  // themselves gets a linked Therapist record (Therapist.linkedUserId ===
  // this manager's user id, set via the "Therapists" Google Sheet tab).
  // When that link exists, they can toggle between their normal manager
  // dashboard and their personal therapist stats without logging out.
  const linkedTherapistProfile = therapists.find(t => t.linkedUserId === user.id) || null;
  const [dashboardView, setDashboardView] = useState<'manager' | 'therapist'>('manager');

  const [targets, setTargets] = useState<{ [key in 'NAO_STUDIO' | 'DIAEL_BEAUTY']: number }>(() => {
    const saved = localStorage.getItem('hka_branch_targets');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // use default
      }
    }
    return {
      'NAO_STUDIO': 20000,
      'DIAEL_BEAUTY': 15000
    };
  });

  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState('');

  const handleSaveTarget = (branchKey: 'NAO_STUDIO' | 'DIAEL_BEAUTY', value: number) => {
    const updated = { ...targets, [branchKey]: value };
    setTargets(updated);
    localStorage.setItem('hka_branch_targets', JSON.stringify(updated));
    setIsEditingTarget(false);
  };
  
  // Resolve branch for filtering
  const activeBranchFilter = isTherapist 
    ? user.branch 
    : (user.role === 'SALON_MANAGER' ? user.branch : selectedBranch);

  // Filter helper
  const filterByBranch = <T extends { branch: 'NAO_STUDIO' | 'DIAEL_BEAUTY' }>(items: T[]) => {
    if (activeBranchFilter === 'ALL') return items;
    return items.filter(item => item.branch === activeBranchFilter);
  };

  // ----------------------------------------------------
  // THERAPIST DASHBOARD LAYOUT
  // ----------------------------------------------------
  if (isTherapist) {
    const therapistProfile = therapists.find(t => t.name.toLowerCase() === user.name.toLowerCase()) || therapists[0];
    return (
      <TherapistStatsPanel
        user={user}
        therapistProfile={therapistProfile}
        bookings={bookings}
        onUpdateBookingStatus={onUpdateBookingStatus}
      />
    );
  }


  // Dual-role manager viewing their personal therapist stats instead of
  // the branch management dashboard.
  if (linkedTherapistProfile && dashboardView === 'therapist') {
    return (
      <div className="space-y-4">
        <DualRoleViewToggle dashboardView={dashboardView} setDashboardView={setDashboardView} />
        <TherapistStatsPanel
          user={user}
          therapistProfile={linkedTherapistProfile}
          bookings={bookings}
          onUpdateBookingStatus={onUpdateBookingStatus}
        />
      </div>
    );
  }

  // ----------------------------------------------------
  // HKA HQ / SALON MANAGER DASHBOARD LAYOUT
  // ----------------------------------------------------
  const branchTx = filterByBranch(transactions);
  const branchBookings = filterByBranch(bookings);
  const branchProducts = filterByBranch(products);

  // Stats Calculations
  const totalRevenue = branchTx.reduce((sum, tx) => sum + tx.total, 0);
  const totalTransactionsCount = branchTx.length;
  const averageTicket = totalTransactionsCount > 0 ? Math.round(totalRevenue / totalTransactionsCount) : 0;
  const totalBookingsCount = branchBookings.length;
  
  // Low Stock Items
  const lowStockItems = branchProducts.filter(p => p.stock <= p.minStock);

  // Branch Performance Details for visual graphs
  const naoRevenue = transactions.filter(t => t.branch === 'NAO_STUDIO').reduce((sum, t) => sum + t.total, 0);
  const diaelRevenue = transactions.filter(t => t.branch === 'DIAEL_BEAUTY').reduce((sum, t) => sum + t.total, 0);

  // Group transactions by month for the selected branch/all branches
  const revenueTrendData = useMemo(() => {
    const groups: { [key: string]: { total: number; count: number } } = {};
    
    branchTx.forEach(tx => {
      if (!tx.date) return;
      // Extract YYYY-MM
      const dateParts = tx.date.split('T')[0].split('-');
      if (dateParts.length < 2) return;
      const key = `${dateParts[0]}-${dateParts[1]}`; // 'YYYY-MM'
      if (!groups[key]) {
        groups[key] = { total: 0, count: 0 };
      }
      groups[key].total += tx.total;
      groups[key].count += 1;
    });

    const monthNames: { [key: string]: string } = {
      '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
      '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
    };

    // Sort keys chronologically
    const sortedKeys = Object.keys(groups).sort();
    
    const trendList = sortedKeys.map(key => {
      const [year, monthNum] = key.split('-');
      const total = groups[key].total;
      const count = groups[key].count;
      return {
        month: `${monthNames[monthNum] || monthNum} ${year}`,
        revenue: total,
        count,
        average: count > 0 ? Math.round(total / count) : 0,
        growth: null as number | null
      };
    });

    // Calculate MoM Growth
    for (let i = 1; i < trendList.length; i++) {
      const prev = trendList[i - 1].revenue;
      const curr = trendList[i].revenue;
      if (prev > 0) {
        trendList[i].growth = Math.round(((curr - prev) / prev) * 100);
      }
    }

    return trendList;
  }, [branchTx]);

  // Active branch for target calculations
  const targetBranch = activeBranchFilter === 'ALL' ? null : (activeBranchFilter as 'NAO_STUDIO' | 'DIAEL_BEAUTY');

  // Compute current month (July 2026) transactions
  const currentMonthTx = useMemo(() => {
    return transactions.filter(tx => tx.date && (tx.date.startsWith('2026-07') || tx.date.startsWith('2026-07-')));
  }, [transactions]);

  // NAO Studio Monthly Revenue
  const naoCurrentMonthRevenue = useMemo(() => {
    return currentMonthTx.filter(tx => tx.branch === 'NAO_STUDIO').reduce((sum, tx) => sum + tx.total, 0);
  }, [currentMonthTx]);

  // DIAEL Beauty Monthly Revenue
  const diaelCurrentMonthRevenue = useMemo(() => {
    return currentMonthTx.filter(tx => tx.branch === 'DIAEL_BEAUTY').reduce((sum, tx) => sum + tx.total, 0);
  }, [currentMonthTx]);

  return (
    <div id="unified-dashboard" className="space-y-6">
      {linkedTherapistProfile && (
        <DualRoleViewToggle dashboardView={dashboardView} setDashboardView={setDashboardView} />
      )}
      {/* Upper Grid of KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* Total Revenue */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold text-slate-400 font-mono tracking-wider block">REVENUE</span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">{formatIDR(totalRevenue)}</span>
            </div>
            <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-500" />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
            <span className="text-emerald-500 font-bold font-sans">+12.4%</span>
            <span>from yesterday</span>
          </div>
        </div>

        {/* Average Ticket */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold text-slate-400 font-mono tracking-wider block">AVG TRANSACTION</span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">{formatIDR(averageTicket)}</span>
            </div>
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-[#D4AF37]" />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
            <span className="text-[#D4AF37] font-bold font-sans">+3.8%</span>
            <span>average basket value</span>
          </div>
        </div>

        {/* Total Bookings */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold text-slate-400 font-mono tracking-wider block">TOTAL BOOKINGS</span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">{totalBookingsCount}</span>
            </div>
            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center">
              <Calendar className="w-6 h-6 text-purple-500" />
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
            <span className="text-purple-500 font-bold font-sans">92%</span>
            <span>therapist occupancy</span>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-semibold text-slate-400 font-mono tracking-wider block">INVENTORY ALERTS</span>
              <span className={`text-2xl font-bold mt-1 block ${lowStockItems.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {lowStockItems.length}
              </span>
            </div>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${lowStockItems.length > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
              <AlertTriangle className={`w-6 h-6 ${lowStockItems.length > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">
            {lowStockItems.length > 0 ? `${lowStockItems.length} products need restocking` : 'All items at healthy stock level'}
          </p>
        </div>
      </div>

      {/* Branch Targets & Monthly Revenue Progress Section */}
      <div id="branch-targets-section" className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-50 rounded-lg text-[#D4AF37]">
                <Target className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-slate-800 font-serif">
                {targetBranch ? `${targetBranch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty'} Target Tracker` : 'Corporate Branch Targets & Monthly Revenue'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {targetBranch 
                ? 'Review live monthly target progression and corresponding treatment commission contributions.' 
                : 'Comparative view of target milestones and monthly performance for both active outlets.'}
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-xs font-mono bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500">Live Period:</span>
            <span className="font-bold text-slate-800">July 2026</span>
          </div>
        </div>

        {targetBranch ? (
          // DETAILED VIEW FOR SINGLE ACTIVE BRANCH
          (() => {
            const currentRevenue = targetBranch === 'NAO_STUDIO' ? naoCurrentMonthRevenue : diaelCurrentMonthRevenue;
            const branchTarget = targets[targetBranch];
            const progress = Math.min(100, Math.round((currentRevenue / (branchTarget || 1)) * 100));
            const remaining = Math.max(0, branchTarget - currentRevenue);

            // Filter current month transactions for therapists in this branch
            const therapistsContribution = therapists
              .filter(t => t.branch === targetBranch)
              .map(ther => {
                const totalContributed = currentMonthTx
                  .filter(tx => tx.branch === targetBranch)
                  .reduce((sum, tx) => {
                    const therServiceItems = tx.items.filter(item => item.type === 'service' && item.therapistId === ther.id);
                    return sum + therServiceItems.reduce((itSum, item) => itSum + (item.price * item.quantity), 0);
                  }, 0);
                return {
                  therapist: ther,
                  contributed: totalContributed,
                  percentOfTarget: branchTarget > 0 ? Math.round((totalContributed / branchTarget) * 100) : 0
                };
              })
              .sort((a, b) => b.contributed - a.contributed);

            // Calculate Product vs Service Contribution for current month
            const branchCMTx = currentMonthTx.filter(tx => tx.branch === targetBranch);
            const servicesCMRev = branchCMTx.reduce((sum, tx) => {
              return sum + tx.items.filter(i => i.type === 'service').reduce((s, item) => s + (item.price * item.quantity), 0);
            }, 0);
            const productsCMRev = branchCMTx.reduce((sum, tx) => {
              return sum + tx.items.filter(i => i.type === 'product').reduce((s, item) => s + (item.price * item.quantity), 0);
            }, 0);

            const servicesPercent = currentRevenue > 0 ? Math.round((servicesCMRev / currentRevenue) * 100) : 0;
            const productsPercent = currentRevenue > 0 ? Math.round((productsCMRev / currentRevenue) * 100) : 0;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Gauge Column */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 space-y-5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">MONTHLY TARGET BREAKDOWN</span>
                      
                      {isEditingTarget ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono font-bold w-24 text-slate-800 focus:outline-none"
                            value={tempTarget}
                            onChange={(e) => setTempTarget(e.target.value)}
                            placeholder="Target"
                            min="1"
                          />
                          <button
                            onClick={() => {
                              const numVal = parseInt(tempTarget, 10);
                              if (!isNaN(numVal) && numVal > 0) {
                                handleSaveTarget(targetBranch, numVal);
                              }
                            }}
                            className="bg-[#D4AF37] text-white hover:bg-amber-600 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setIsEditingTarget(false)}
                            className="bg-slate-200 text-slate-600 hover:bg-slate-300 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">Target: {formatIDR(branchTarget)}</span>
                          <button
                            onClick={() => {
                              setTempTarget(branchTarget.toString());
                              setIsEditingTarget(true);
                            }}
                            className="text-slate-400 hover:text-[#D4AF37] p-1 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
                            title="Edit target"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-end justify-between">
                        <div>
                          <span className="text-xs font-mono text-slate-400">Total Monthly Revenue</span>
                          <span className="text-2xl font-extrabold text-slate-900 block mt-1">{formatIDR(currentRevenue)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-extrabold text-[#D4AF37] font-mono">{progress}%</span>
                          <span className="text-[10px] text-slate-400 font-mono block">COMPLETED</span>
                        </div>
                      </div>

                      {/* Elegant Progress bar */}
                      <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
                        <div 
                          className="h-full bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(212,175,55,0.25)]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      {remaining > 0 ? (
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                          <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
                          <span>{formatIDR(remaining)} needed to reach monthly goal</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>Milestone achieved! Current month targets successfully beaten!</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Service vs Product Contribution */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50/40 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Treatments (Services)</span>
                        <span className="text-base font-bold text-slate-800 mt-1 block">{formatIDR(servicesCMRev)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>Contribution:</span>
                        <span className="font-bold text-[#D4AF37]">{servicesPercent}%</span>
                      </div>
                    </div>

                    <div className="bg-slate-50/40 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] font-mono text-slate-400 uppercase block">Retail (Products)</span>
                        <span className="text-base font-bold text-slate-800 mt-1 block">{formatIDR(productsCMRev)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>Contribution:</span>
                        <span className="font-bold text-slate-800">{productsPercent}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Staff Contributions Column */}
                <div className="lg:col-span-5 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">Therapist Sales Share</h4>
                    <p className="text-[10px] text-slate-400">Services revenue generated by therapists this month.</p>
                  </div>

                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                    {therapistsContribution.map(({ therapist, contributed, percentOfTarget }) => (
                      <div key={therapist.id} className="p-3 bg-slate-50 hover:bg-[#FDFBF7] border border-slate-100 rounded-xl flex items-center justify-between transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-slate-800 text-white flex items-center justify-center font-bold text-xs font-serif shadow-xs">
                            {therapist.name.charAt(0)}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">{therapist.name}</span>
                            <span className="text-[9px] text-slate-400 font-mono">Target contribution: {percentOfTarget}%</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-slate-950 block font-mono">{formatIDR(contributed)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          // COMPARATIVE HQ VIEW FOR BOTH BRANCHES
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* NAO STUDIO CARD */}
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">NAO STUDIO</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Target: {formatIDR(targets.NAO_STUDIO)}</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[9px] text-slate-400 font-mono block uppercase">Month Revenue</span>
                    <span className="text-lg font-extrabold text-slate-900 mt-0.5 block">{formatIDR(naoCurrentMonthRevenue)}</span>
                  </div>
                  <span className="text-base font-bold text-[#D4AF37] font-mono">
                    {Math.min(100, Math.round((naoCurrentMonthRevenue / (targets.NAO_STUDIO || 1)) * 100))}%
                  </span>
                </div>
                
                {/* Progress track */}
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-[#D4AF37] rounded-full"
                    style={{ width: `${Math.min(100, Math.round((naoCurrentMonthRevenue / (targets.NAO_STUDIO || 1)) * 100))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* DIAEL BEAUTY CARD */}
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100 space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">DIAEL BEAUTY</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Target: {formatIDR(targets.DIAEL_BEAUTY)}</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[9px] text-slate-400 font-mono block uppercase">Month Revenue</span>
                    <span className="text-lg font-extrabold text-slate-900 mt-0.5 block">{formatIDR(diaelCurrentMonthRevenue)}</span>
                  </div>
                  <span className="text-base font-bold text-slate-800 font-mono">
                    {Math.min(100, Math.round((diaelCurrentMonthRevenue / (targets.DIAEL_BEAUTY || 1)) * 100))}%
                  </span>
                </div>
                
                {/* Progress track */}
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-slate-700 to-slate-900 rounded-full"
                    style={{ width: `${Math.min(100, Math.round((diaelCurrentMonthRevenue / (targets.DIAEL_BEAUTY || 1)) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Charts Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Revenue Trend Chart (Recharts) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-8 flex flex-col">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-base font-bold text-slate-800 font-serif">Revenue Trend</h3>
                <p className="text-xs text-slate-500">Track monthly sales growth and seasonal spikes.</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-400 block">CURRENT TREND</span>
                <span className="text-sm font-bold text-emerald-600 font-mono">
                  +{revenueTrendData.length > 1 ? (((revenueTrendData[revenueTrendData.length - 1].revenue - revenueTrendData[0].revenue) / (revenueTrendData[0].revenue || 1)) * 100).toFixed(0) : 0}% Overall
                </span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full mt-4">
            {revenueTrendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                No revenue trend data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenueTrendData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="month" 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  />
                  <YAxis 
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                    tickFormatter={(val) => {
                      if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}M`;
                      if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}k`;
                      return `Rp ${val}`;
                    }}
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      borderRadius: '12px', 
                      color: '#fff', 
                      border: 'none',
                      fontFamily: 'sans-serif',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                    }}
                    formatter={(value: any) => [formatIDR(Number(value)), 'Revenue']}
                    labelStyle={{ color: '#D4AF37', fontWeight: 'bold', fontSize: '11px', fontFamily: 'monospace' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#D4AF37" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#revenueColor)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Monthly Revenue Breakdown Table */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 font-mono tracking-wider uppercase mb-3">Detailed Monthly Breakdown</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-mono text-slate-400 tracking-wider uppercase">
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 font-medium text-right">Transactions</th>
                    <th className="pb-2 font-medium text-right">Avg Ticket Size</th>
                    <th className="pb-2 font-medium text-right">MoM Growth</th>
                    <th className="pb-2 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {revenueTrendData.map((row) => (
                    <tr key={row.month} className="hover:bg-slate-50/40 transition-colors">
                      <td className="py-2.5 font-medium text-slate-700">{row.month}</td>
                      <td className="py-2.5 text-right font-mono text-slate-600">{row.count}</td>
                      <td className="py-2.5 text-right font-mono text-slate-600">{formatIDR(row.average)}</td>
                      <td className="py-2.5 text-right font-mono">
                        {row.growth === null ? (
                          <span className="text-slate-400">-</span>
                        ) : row.growth > 0 ? (
                          <span className="text-emerald-600 font-semibold">+{row.growth}%</span>
                        ) : row.growth < 0 ? (
                          <span className="text-rose-600 font-semibold">{row.growth}%</span>
                        ) : (
                          <span className="text-slate-500">0%</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-slate-900">{formatIDR(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Branch Operations Distribution */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 font-serif mb-1">Operational Metrics</h3>
            <p className="text-xs text-slate-500">Cross-branch appointments division.</p>
          </div>

          <div className="my-6 flex flex-col items-center justify-center">
            {/* Minimal aesthetic circle distribution simulation */}
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-100"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#D4AF37]"
                  strokeDasharray="45, 100"
                  strokeWidth="4"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-xs font-bold text-slate-500 font-mono uppercase block leading-none">TOTAL</span>
                <span className="text-xl font-bold text-slate-900 mt-1 inline-block">{totalBookingsCount}</span>
              </div>
            </div>

            <div className="w-full mt-6 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <div className="w-2.5 h-2.5 bg-[#D4AF37] rounded-full" />
                  <span>NAO Studio Bookings</span>
                </div>
                <span className="font-mono text-slate-800">
                  {bookings.filter(b => b.branch === 'NAO_STUDIO').length} slots
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <div className="w-2.5 h-2.5 bg-slate-300 rounded-full" />
                  <span>DIAEL Beauty Bookings</span>
                </div>
                <span className="font-mono text-slate-800">
                  {bookings.filter(b => b.branch === 'DIAEL_BEAUTY').length} slots
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Secondary Performance Indices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Branch Performance Summary (Beautiful custom graphical dashboard SVG widgets) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-slate-800 font-serif">Revenue Performance Index</h3>
              <span className="text-[10px] font-mono text-slate-400">JULY 2026</span>
            </div>
            <p className="text-xs text-slate-500 mb-6">Comparative visualization of sales and operational flow between physical branches.</p>
          </div>

          {/* Simple custom visual graph bars */}
          <div className="space-y-6 my-4 font-sans">
            {/* NAO Studio */}
            <div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#D4AF37]" />
                  <span>NAO Studio (Hair & Nails)</span>
                </div>
                <span className="font-mono text-[#D4AF37] font-bold">{formatIDR(naoRevenue)}</span>
              </div>
              <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden flex">
                <div 
                  className="bg-gradient-to-r from-amber-500 to-[#D4AF37] h-full rounded-full" 
                  style={{ width: `${(naoRevenue / (naoRevenue + diaelRevenue || 1)) * 100}%` }}
                />
              </div>
            </div>

            {/* DIAEL Beauty */}
            <div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-800" />
                  <span>DIAEL Beauty Center (Lash & Spa)</span>
                </div>
                <span className="font-mono text-slate-800 font-bold">{formatIDR(diaelRevenue)}</span>
              </div>
              <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden flex">
                <div 
                  className="bg-gradient-to-r from-slate-700 to-slate-900 h-full rounded-full" 
                  style={{ width: `${(diaelRevenue / (naoRevenue + diaelRevenue || 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-50 grid grid-cols-2 gap-4 text-center">
            <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
              <span className="text-[10px] text-slate-400 font-mono block">NAO SHARE</span>
              <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 inline-block">
                {((naoRevenue / (naoRevenue + diaelRevenue || 1)) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
              <span className="text-[10px] text-slate-400 font-mono block">DIAEL SHARE</span>
              <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 inline-block">
                {((diaelRevenue / (naoRevenue + diaelRevenue || 1)) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Therapist commission dashboard */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 font-serif">Therapist Performance & Commissions</h3>
              <p className="text-xs text-slate-500">Live operational tiers & commission payout calculations.</p>
            </div>
            <Award className="w-5 h-5 text-[#D4AF37]" />
          </div>

          <div className="space-y-4">
            {therapists.map((therapist) => (
              <div key={therapist.id} className="p-3 bg-slate-50 hover:bg-[#FDFBF7] border border-slate-100 rounded-2xl flex items-center justify-between transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1a1c1e] text-white rounded-xl flex items-center justify-center font-bold font-serif shadow-xs">
                    {therapist.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{therapist.name}</h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] font-mono font-medium px-1.5 py-0.2 rounded bg-amber-500/10 text-[#D4AF37] border border-amber-500/10">
                        {therapist.branch === 'NAO_STUDIO' ? 'NAO' : 'DIAEL'}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">Rating: ★ {therapist.rating}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-slate-400 font-mono block">COMMISSION</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">{formatIDR(therapist.totalCommissionEarned)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Sales Feed */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 font-serif">Recent Sales Feed</h3>
            <p className="text-xs text-slate-500">Cross-branch register records.</p>
          </div>
          <TrendingUp className="w-5 h-5 text-emerald-500" />
        </div>

        {branchTx.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">No transactions logged today.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branchTx.slice(0, 6).map((tx) => (
              <div key={tx.id} className="p-3 bg-slate-50/50 border border-slate-100/60 rounded-xl flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800 truncate">{tx.customerName}</span>
                    <span className="text-[8px] font-mono px-1 bg-slate-200 text-slate-700 rounded scale-95 uppercase">
                      {tx.branch === 'NAO_STUDIO' ? 'NAO' : 'DIAEL'}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5 block truncate">
                    {tx.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-slate-900 font-mono block">{formatIDR(tx.total)}</span>
                  <span className="text-[8px] text-slate-400 font-mono">{tx.paymentMethod.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
