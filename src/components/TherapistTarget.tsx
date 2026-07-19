import React, { useMemo } from 'react';
import { User, Therapist, Transaction } from '../types';
import { formatIDR } from '../utils';
import { 
  TrendingUp, 
  Award, 
  Star, 
  Scissors, 
  DollarSign, 
  Sparkles, 
  CalendarDays,
  Target
} from 'lucide-react';

interface TherapistTargetProps {
  user: User;
  therapists: Therapist[];
  transactions: Transaction[];
}

export default function TherapistTarget({
  user,
  therapists,
  transactions
}: TherapistTargetProps) {
  // Find the therapist object that matches this user. Matched by name only
  // (there's no stable id linking a User account to a Therapist record),
  // so this also scopes to the user's own branch to avoid accidentally
  // matching a different, same-named therapist at the other branch.
  const therapist = useMemo(() => {
    const targetName = user.name.trim().toLowerCase();
    return therapists.find(
      t => t.name.trim().toLowerCase() === targetName && t.branch === user.branch
    );
  }, [therapists, user]);

  // Find all service sales logged for this therapist
  const mySales = useMemo(() => {
    if (!therapist) return [];
    
    const salesList: Array<{
      txId: string;
      customerName: string;
      serviceName: string;
      price: number;
      commission: number;
      date: string;
    }> = [];

    transactions.forEach(tx => {
      tx.items.forEach(item => {
        if (item.type === 'service' && item.therapistId === therapist.id) {
          salesList.push({
            txId: tx.id,
            customerName: tx.customerName,
            serviceName: item.name,
            price: item.price * item.quantity,
            commission: Math.round(item.price * item.quantity * therapist.commissionRate),
            date: tx.date
          });
        }
      });
    });

    return salesList;
  }, [transactions, therapist]);

  // "This month's" sales, computed live from the transactions this
  // component already has - deliberately NOT therapist.currentSales, which
  // is a lifetime cumulative total kept in permanent lockstep with the
  // Google Sheet (see server/controllers/sheetsPersistController.ts /
  // googleSheetsController.ts) and is never reset. This sums exactly the
  // same way checkoutController.ts adds to currentSales at checkout time
  // (price * quantity per item, matched to this therapist), scoped to the
  // current calendar month. It rolls over automatically at the start of
  // every month with nothing to schedule, store, or reset - and it can
  // never "rebound", since it isn't a counter that gets written anywhere.
  const currentSales = useMemo(() => {
    if (!therapist) return 0;
    const currentMonthPrefix = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    let total = 0;
    for (const tx of transactions) {
      if (!tx.date.startsWith(currentMonthPrefix)) continue;
      for (const item of tx.items) {
        if (item.type === 'service' && item.therapistId === therapist.id) {
          total += item.price * item.quantity;
        }
      }
    }
    return total;
  }, [transactions, therapist]);

  if (!therapist) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 p-8 shadow-sm text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="p-4 bg-amber-50 text-[#D4AF37] rounded-full w-16 h-16 flex items-center justify-center mx-auto">
          <Award className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Therapist Profile Pending</h3>
        <p className="text-xs text-slate-400">
          We couldn't locate your corresponding HKA Therapist profile. Please verify your account name matches the therapist database.
        </p>
        <p className="text-[10px] text-slate-300 font-mono">
          Looking for a therapist named "{user.name}" at {user.branch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty'}. Ask HKA_MANAGEMENT
          to confirm the name matches exactly (including branch) in ERP &gt; Therapist Records.
        </p>
      </div>
    );
  }

  const monthlyTarget = therapist.monthlyTarget || 5000;
  const progressPercent = Math.min(100, Math.round((currentSales / monthlyTarget) * 100));
  const remainingSales = Math.max(0, monthlyTarget - currentSales);

  return (
    <div id="therapist-performance-tracker" className="space-y-8 animate-fade-in">
      
      {/* Header ribbon */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 font-serif">My Performance Dashboard</h2>
        <p className="text-xs text-slate-500 mt-1">
          Review your live sales targets, commission ledger, customer ratings, and certified specialties.
        </p>
      </div>

      {/* Target Progress widget */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Progress Gauge */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#D4AF37]" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">Monthly Target Progress</h3>
            </div>
            <span className="text-xs font-bold font-mono text-[#D4AF37] bg-amber-50 px-3 py-1 rounded-full border border-amber-100/60">
              {progressPercent}% Met
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-xs text-slate-500 font-mono">
              <span>Sales This Month: {formatIDR(currentSales)}</span>
              <span>Target: {formatIDR(monthlyTarget)}</span>
            </div>
            
            {/* Elegant multi-gradient progress track */}
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] rounded-full transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(212,175,55,0.2)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {remainingSales > 0 ? (
              <p className="text-[11px] text-slate-400 italic">
                ✨ Only <strong className="text-[#D4AF37]">{formatIDR(remainingSales)}</strong> remaining to hit your monthly high-performance tier!
              </p>
            ) : (
              <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1.5">
                🎉 Congratulations! You have fully crushed your monthly target tier! Good job!
              </p>
            )}
          </div>
        </div>

        {/* Rating and Quick Stats */}
        <div className="lg:col-span-4 bg-gradient-to-br from-[#1a1c1e] to-slate-800 rounded-3xl p-6 text-slate-100 flex flex-col justify-between shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-wider font-mono">Client Rating</span>
            <div className="flex items-center gap-1 text-amber-400">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span className="text-xs font-bold font-mono">{therapist.rating}</span>
            </div>
          </div>

          <div className="my-4">
            <span className="text-2xl font-bold text-white font-serif tracking-tight">{formatIDR(therapist.totalCommissionEarned || 0)}</span>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider block mt-1">TOTAL COMMISSION EARNED</span>
          </div>

          <div className="pt-3 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Commission Rate</span>
            <span className="font-mono text-white font-semibold">{therapist.commissionRate * 100}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Specialties */}
        <div className="xl:col-span-4 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm h-fit space-y-4">
          <div className="pb-4 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
              <Scissors className="w-4 h-4 text-[#D4AF37]" />
              <span>Certified Specialties</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">Your registered treatment services.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {therapist.specialties.map((spec, i) => (
              <span 
                key={i} 
                className="px-3 py-1.5 bg-slate-50 border border-slate-100 text-slate-600 rounded-xl text-[10px] font-medium"
              >
                {spec}
              </span>
            ))}
          </div>
        </div>

        {/* Sales ledger */}
        <div className="xl:col-span-8 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
          <div className="pb-4 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">My Completed Treatment Ledger</h3>
            <p className="text-xs text-slate-400 mt-0.5">List of service checkouts credited to your commission account.</p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                  <th className="py-3 px-4">Transaction</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Treatment</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4 text-right">My Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
                {mySales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-400">
                      No treatments have been logged or checked out on your ledger today.
                    </td>
                  </tr>
                ) : (
                  mySales.map((sale, i) => (
                    <tr key={i} className="hover:bg-slate-50/30">
                      <td className="py-3 px-4 font-mono font-medium text-[#D4AF37]">
                        {sale.txId}
                        <span className="block text-[9px] text-slate-400 font-normal mt-0.5">{sale.date.split(' ')[0]}</span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {sale.customerName}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {sale.serviceName}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {formatIDR(sale.price)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                        +{formatIDR(sale.commission)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
