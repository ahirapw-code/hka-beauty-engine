import React, { useState, useMemo, useEffect } from 'react';
import { User, Branch, Customer } from '../types';
import { formatIDR, getMembershipTier, visitsUntilNextTier, MEMBERSHIP_TIERS, MEMBERSHIP_DISCOUNT_PERCENT } from '../utils';
import { Users, Search, UserPlus, Phone, Mail, Award, History, Landmark, Sparkles, Gift, X } from 'lucide-react';

interface CRMProps {
  user: User;
  selectedBranch: Branch;
  customers: Customer[];
  onAddCustomer: (customer: Omit<Customer, 'id' | 'totalSpend' | 'visitsCount'>) => void;
  onActivateMembership: (customerId: string) => void;
}

export default function CRM({
  user,
  selectedBranch,
  customers,
  onAddCustomer,
  onActivateMembership
}: CRMProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  // New customer registration state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredBranch, setPreferredBranch] = useState<'NAO_STUDIO' | 'DIAEL_BEAUTY'>(
    user.branch === 'ALL' ? 'NAO_STUDIO' : user.branch as 'NAO_STUDIO' | 'DIAEL_BEAUTY'
  );
  const [notes, setNotes] = useState('');
  const [registerAsMember, setRegisterAsMember] = useState(false);

  // Handle active branch filtering
  const activeBranchFilter = user.role === 'SALON_MANAGER' ? user.branch : selectedBranch;

  // Lock background scroll while the modal is open (important on mobile,
  // otherwise the page can scroll behind the modal and the form looks "stuck")
  useEffect(() => {
    if (showAddCustomer) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [showAddCustomer]);


  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            c.phone.includes(searchQuery);
      
      const matchesBranch = activeBranchFilter === 'ALL' || c.preferredBranch === activeBranchFilter;
      
      return matchesSearch && matchesBranch;
    });
  }, [customers, searchQuery, activeBranchFilter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    onAddCustomer({
      name,
      email: email || `${name.toLowerCase().replace(/\s+/g, '')}@hka.com`,
      phone,
      preferredBranch,
      notes: notes || 'Regular customer',
      isMember: registerAsMember,
      memberSince: registerAsMember ? new Date().toISOString().substring(0, 10) : undefined
    });

    // Reset Form
    setName('');
    setEmail('');
    setPhone('');
    setNotes('');
    setRegisterAsMember(false);
    setShowAddCustomer(false);
  };

  return (
    <div id="crm-module" className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      
      {/* Customer Directory */}
      <div className="xl:col-span-8 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
        
        {/* Header tools */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Unified Client Profiles</h3>
            <p className="text-xs text-slate-400 mt-0.5">Track beauty profile preferences, spend charts, and loyalty records.</p>
          </div>
          
          <button
            onClick={() => setShowAddCustomer(true)}
            className="px-4 py-2 bg-[#1a1c1e] hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-sm self-start"
          >
            <UserPlus className="w-4 h-4 text-[#D4AF37]" />
            <span>Add Client Profile</span>
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search clients by name or telephone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/20 focus:border-[#D4AF37] text-slate-800"
          />
        </div>

        {/* Profiles Feed */}
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-mono">No client accounts found.</div>
          ) : (
            filteredCustomers.map((cust) => {
              const tier = getMembershipTier(cust.visitsCount);
              const tierInfo = MEMBERSHIP_TIERS[tier];
              const nextTier = visitsUntilNextTier(cust.visitsCount);

              return (
              <div key={cust.id} className="p-4 bg-slate-50/50 hover:bg-[#FDFBF7] border border-slate-100 hover:border-[#D4AF37]/30 rounded-2xl transition-all space-y-3 shadow-xs">
                {/* Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 border border-slate-200 text-slate-700 rounded-full flex items-center justify-center font-bold">
                      {cust.name.split(' ').map(n => n.charAt(0)).join('')}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900">{cust.name}</h4>
                        {cust.isMember && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold uppercase flex items-center gap-1 ${tierInfo.badgeClass}`}>
                            <Sparkles className="w-2.5 h-2.5" />
                            {tierInfo.label} Member
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">Preferred: {cust.preferredBranch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty Center'}</span>
                    </div>
                  </div>

                  {/* Loyalty stats */}
                  <div className="flex gap-4 self-start sm:self-auto text-xs">
                    <div className="text-right">
                      <span className="text-[9px] text-slate-400 font-mono block">TOTAL LIFETIME SPEND</span>
                      <span className="font-mono font-bold text-slate-900">{formatIDR(cust.totalSpend)}</span>
                    </div>
                    <div className="text-right border-l border-slate-200 pl-4">
                      <span className="text-[9px] text-slate-400 font-mono block">VISITS</span>
                      <span className="font-mono font-bold text-slate-900">{cust.visitsCount} times</span>
                    </div>
                  </div>
                </div>

                {/* Membership status row */}
                {cust.isMember ? (
                  <div className="bg-[#FDFBF7] border border-[#D4AF37]/20 rounded-xl p-2.5 flex items-start gap-2">
                    <Gift className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
                    <div className="text-[10px] text-slate-600 leading-relaxed">
                      <span className="font-bold text-slate-800">Diskon otomatis {MEMBERSHIP_DISCOUNT_PERCENT}%</span> aktif setiap transaksi.{' '}
                      {nextTier ? (
                        <span>
                          {nextTier.visitsRemaining} kunjungan lagi menuju tier{' '}
                          <span className="font-bold">{MEMBERSHIP_TIERS[nextTier.nextTier].label}</span> (gift/voucher diberikan manual oleh outlet).
                        </span>
                      ) : (
                        <span>Sudah mencapai tier tertinggi (Platinum).</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 bg-slate-100/70 rounded-xl p-2.5">
                    <span className="text-[10px] text-slate-500">Belum terdaftar sebagai member.</span>
                    <button
                      onClick={() => onActivateMembership(cust.id)}
                      className="px-2.5 py-1 bg-[#1a1c1e] hover:bg-slate-800 text-[#D4AF37] text-[10px] font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1 shrink-0"
                    >
                      <Sparkles className="w-3 h-3" />
                      Jadikan Member
                    </button>
                  </div>
                )}

                {/* Sub row of contacts & notes */}
                <div className="pt-2.5 border-t border-slate-100 flex flex-col md:flex-row gap-4 justify-between">
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{cust.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{cust.email}</span>
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex-1 min-w-0">
                    <span className="text-[9px] text-[#D4AF37] font-mono block uppercase font-bold">Clinical & Styling Notes</span>
                    <p className="text-xs text-slate-600 italic truncate mt-0.5">"{cust.notes || 'No custom preferences recorded'}"</p>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>

      {/* Cross-Branch Analytics Module */}
      <div className="xl:col-span-4">
        <div className="bg-[#1a1c1e] text-white rounded-3xl p-6 shadow-md text-center space-y-4">
          <Award className="w-10 h-10 text-[#D4AF37] mx-auto" />
          <div>
            <h3 className="font-serif text-[#D4AF37] text-base font-bold">Cross-Branch Analytics</h3>
            <p className="text-xs text-slate-400 mt-1">Cross-brand salon engines sharing unified profile repositories across NAO Studio and DIAEL Beauty Center.</p>
          </div>
          <button
            onClick={() => setShowAddCustomer(true)}
            className="w-full bg-[#D4AF37] text-[#1a1c1e] font-bold text-xs py-2 rounded-xl hover:bg-amber-400 cursor-pointer transition-all"
          >
            Add New Client
          </button>
        </div>
      </div>

      {/* Add Client Modal — rendered as a fixed overlay so it always appears
          centered in the viewport, regardless of scroll position or screen
          size. Previously this form lived inline in the xl:col-span-4 grid
          cell, which meant on mobile (single-column layout) it rendered
          *below* the entire customer list, off-screen, making the
          "Add Client Profile" button look broken. */}
      {showAddCustomer && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={() => setShowAddCustomer(false)}
        >
          <div
            className="bg-white rounded-3xl border border-slate-100 p-6 shadow-xl space-y-4 w-full max-w-md my-8 sm:my-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Create Client Record</h3>
              <button
                onClick={() => setShowAddCustomer(false)}
                className="text-slate-400 hover:text-rose-500 cursor-pointer p-1 -m-1"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">CLIENT NAME *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amara Al-Thani"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">PHONE NUMBER *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. +974 5543 2189"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">EMAIL ADDRESS</label>
                <input
                  type="email"
                  placeholder="e.g. amara@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">LOYALTY MAIN BRANCH</label>
                <select
                  value={preferredBranch}
                  onChange={(e: any) => setPreferredBranch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 focus:outline-none"
                >
                  <option value="NAO_STUDIO">NAO Studio (Hair & Nails)</option>
                  <option value="DIAEL_BEAUTY">DIAEL Beauty Center (Lashes & Spa)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">STYLING NOTES & CLINICAL RECORDS</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Sensitive eyes, prefers warm tea, Balayage shades record"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                />
              </div>

              <label className="flex items-center gap-2.5 bg-[#FDFBF7] border border-[#D4AF37]/30 rounded-xl px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={registerAsMember}
                  onChange={(e) => setRegisterAsMember(e.target.checked)}
                  className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                />
                <span className="text-[10px] text-slate-700 leading-snug">
                  <span className="font-bold">Daftarkan sebagai Member (Basic)</span> — otomatis dapat diskon 5% setiap transaksi. Naik ke Silver/Gold/Platinum otomatis berdasarkan jumlah kunjungan.
                </span>
              </label>

              <button
                type="submit"
                className="w-full bg-[#1a1c1e] hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 mt-4"
              >
                <span>Save CRM Profile</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
