import React, { useState, useEffect } from 'react';
import { User, Branch, Therapist, Payroll } from '../types';
import { db, auth } from '../lib/firebase';
import { doc, setDoc, updateDoc, deleteDoc } from '../lib/firestoreClient';
import { adjustTherapistCommission } from '../lib/firestoreService';
import { formatIDR } from '../utils';
import { 
  Coins, 
  UserCheck, 
  Building2, 
  Calendar, 
  FileText, 
  Check, 
  Trash2, 
  Lock, 
  Unlock, 
  AlertCircle, 
  Plus, 
  Minus, 
  Save, 
  Loader2, 
  ShieldAlert,
  Pencil
} from 'lucide-react';

interface PayrollProps {
  user: User;
  selectedBranch: Branch;
}

export default function PayrollComponent({ user, selectedBranch: initialBranch }: PayrollProps) {
  // Enforce specific branch selection for payroll document consistency (HKA can switch, Managers are locked to their own)
  const isHKA = user.role === 'HKA_MANAGEMENT';
  const initialSpecificBranch = (initialBranch === 'ALL' || !initialBranch) 
    ? (user.branch === 'ALL' ? 'NAO_STUDIO' : user.branch as Exclude<Branch, 'ALL'>)
    : initialBranch as Exclude<Branch, 'ALL'>;

  const [selectedBranch, setSelectedBranch] = useState<Exclude<Branch, 'ALL'>>(initialSpecificBranch);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  });

  const [activeTab, setActiveTab] = useState<'therapists' | 'managers'>('therapists');

  // Core entities state
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  // userId -> linked Therapist, for managers who are dual-role (also
  // perform services themselves). Populated alongside the managers list.
  const [linkedTherapistsByUserId, setLinkedTherapistsByUserId] = useState<Record<string, Therapist>>({});
  const [existingPayrolls, setExistingPayrolls] = useState<Payroll[]>([]);
  const [calculatedPreviews, setCalculatedPreviews] = useState<Record<string, { baseSalary: number; commissionEarned: number; daysPresent: number }>>({});
  
  // Loading & error states
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual inputs for bonus, deductions, and commission (for managers) in draft/preview mode
  const [manualInputs, setManualInputs] = useState<Record<string, { bonus: number; deductions: number; commissionEarned?: number }>>({});

  // Sync state if branch changes from outside
  useEffect(() => {
    if (initialBranch !== 'ALL' && initialBranch) {
      setSelectedBranch(initialBranch as Exclude<Branch, 'ALL'>);
    }
  }, [initialBranch]);

  // Load data whenever branch, month or active tab changes
  useEffect(() => {
    const loadPayrollData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Single server-side aggregation call instead of the previous
        // pattern of: fetch the staff list, then loop over every single
        // staff member firing 2-3 sequential HTTP round trips each
        // (calculateTherapistPayrollForPeriod / calculateStaffAttendance).
        // That sequential N+1 loop is what caused this screen to 504 once
        // staff count grew - this replaces it with one request that does
        // the same aggregation server-side in a handful of bulk queries.
        const idToken = await auth.currentUser?.getIdToken();
        const params = new URLSearchParams({
          branch: selectedBranch,
          periodMonth: selectedMonth,
          staffType: activeTab,
        });
        const response = await fetch(`/api/payroll/preview?${params.toString()}`, {
          headers: {
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
        });
        const resData = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(resData.error || `Failed to load payroll preview (status ${response.status})`);
        }

        const loadedPayrolls: Payroll[] = resData.existingPayrolls || [];
        setExistingPayrolls(loadedPayrolls);

        if (activeTab === 'therapists') {
          const loadedTherapists: Therapist[] = resData.staff || [];
          setTherapists(loadedTherapists);

          const previews: typeof calculatedPreviews = resData.previews || {};
          const inputs: typeof manualInputs = {};

          for (const therapist of loadedTherapists) {
            const existing = loadedPayrolls.find(p => p.staffId === therapist.id && p.staffType === 'therapist');
            if (existing) {
              inputs[therapist.id] = {
                bonus: existing.bonus,
                deductions: existing.deductions
              };
              // Already-generated payrolls are locked to their originally
              // saved figures, not the freshly recalculated preview.
              delete previews[therapist.id];
            } else {
              inputs[therapist.id] = {
                bonus: 0,
                deductions: 0
              };
            }
          }
          setCalculatedPreviews(previews);
          setManualInputs(inputs);

        } else if (activeTab === 'managers' && isHKA) {
          const loadedManagers: User[] = resData.staff || [];
          setManagers(loadedManagers);
          setLinkedTherapistsByUserId(resData.linkedTherapistsByUserId || {});

          const previews: typeof calculatedPreviews = resData.previews || {};
          const inputs: typeof manualInputs = {};

          for (const manager of loadedManagers) {
            const existing = loadedPayrolls.find(p => p.staffId === manager.id && p.staffType === 'manager');
            if (existing) {
              inputs[manager.id] = {
                bonus: existing.bonus,
                deductions: existing.deductions,
                commissionEarned: existing.commissionEarned
              };
              delete previews[manager.id];
            } else {
              inputs[manager.id] = {
                bonus: 0,
                deductions: 0,
                commissionEarned: 0
              };
            }
          }
          setCalculatedPreviews(previews);
          setManualInputs(inputs);
        }
      } catch (err: any) {
        console.error('Error loading payroll data:', err);
        setError('Gagal memuat data payroll: ' + (err.message || String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    loadPayrollData();
  }, [selectedBranch, selectedMonth, activeTab, isHKA]);

  // Handle manual input changes
  const handleInputChange = (staffId: string, field: 'bonus' | 'deductions' | 'commissionEarned', value: number) => {
    setManualInputs(prev => ({
      ...prev,
      [staffId]: {
        ...prev[staffId],
        [field]: Math.max(0, value)
      }
    }));
  };

  // Manually corrects a therapist's accumulated totalCommissionEarned (the
  // figure shown on the Dashboard's "Therapist Performance & Commissions"
  // card). That field is only ever auto-incremented by checkout - it can't
  // be fixed via the Sheet (edits there are a no-op by design), so this is
  // the one audited path for a correction, e.g. resetting it to 0 after a
  // payout. HKA_MANAGEMENT only; every change is logged server-side.
  const handleAdjustTotalCommission = async (therapist: Therapist) => {
    const currentValue = therapist.totalCommissionEarned || 0;
    const input = window.prompt(
      `Ubah total komisi terkumpul untuk ${therapist.name}.\nNilai saat ini: ${formatIDR(currentValue)}\n\nMasukkan nilai baru (Rp):`,
      String(currentValue)
    );
    if (input === null) return; // cancelled

    const newValue = Number(input);
    if (isNaN(newValue) || newValue < 0) {
      alert('Nilai tidak valid. Masukkan angka non-negatif.');
      return;
    }
    if (newValue === currentValue) return;

    const reason = window.prompt('Alasan penyesuaian (opsional, untuk log audit):') || undefined;

    setIsActionLoading(`adjust_commission_${therapist.id}`);
    try {
      const updated = await adjustTherapistCommission(therapist.id, newValue, reason);
      setTherapists(prev => prev.map(t => (t.id === therapist.id ? { ...t, ...updated } : t)));
    } catch (err: any) {
      console.error('Error adjusting total commission:', err);
      alert('Gagal menyesuaikan komisi: ' + (err.message || String(err)));
    } finally {
      setIsActionLoading(null);
    }
  };

  // Generate a draft payroll document in Firestore
  const handleGenerateDraft = async (staffId: string, staffName: string, staffType: 'therapist' | 'manager') => {
    setIsActionLoading(`draft_${staffId}`);
    setError(null);
    try {
      const input = manualInputs[staffId] || { bonus: 0, deductions: 0, commissionEarned: 0 };
      const preview = calculatedPreviews[staffId] || { baseSalary: 0, commissionEarned: 0, daysPresent: 0 };

      const baseSalary = preview.baseSalary || 0;
      const commissionEarned = staffType === 'therapist' ? preview.commissionEarned : (input.commissionEarned || 0);
      const daysPresent = Math.round(preview.daysPresent);

      const bonus = input.bonus || 0;
      const deductions = input.deductions || 0;
      const netPay = Math.max(0, baseSalary + commissionEarned + bonus - deductions);

      const payrollId = `payroll_${staffId}_${selectedMonth}`;
      
      const newPayroll: Payroll = {
        id: payrollId,
        staffId,
        staffName,
        staffType,
        branch: selectedBranch,
        periodMonth: selectedMonth,
        baseSalary,
        commissionEarned,
        daysPresent,
        bonus,
        deductions,
        netPay,
        status: 'draft',
        generatedAt: new Date().toISOString(),
        generatedBy: user.name || user.email
      };

      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/payroll/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify(newPayroll),
      });
      const resData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(resData.error || `Failed to create payroll draft (status ${response.status})`);
      }

      // Update local state
      setExistingPayrolls(prev => [...prev.filter(p => p.id !== payrollId), newPayroll]);
    } catch (err: any) {
      console.error('Error saving payroll draft:', err);
      setError('Gagal membuat draft payroll: ' + (err.message || String(err)));
    } finally {
      setIsActionLoading(null);
    }
  };

  // Save changes to a draft payroll document
  const handleSaveDraftChanges = async (payroll: Payroll) => {
    setIsActionLoading(`save_${payroll.staffId}`);
    setError(null);
    try {
      const input = manualInputs[payroll.staffId] || { bonus: 0, deductions: 0, commissionEarned: 0 };
      
      const commissionEarned = payroll.staffType === 'therapist' ? payroll.commissionEarned : (input.commissionEarned || 0);
      const bonus = input.bonus || 0;
      const deductions = input.deductions || 0;
      const netPay = Math.max(0, payroll.baseSalary + commissionEarned + bonus - deductions);

      const updatedPayroll: Payroll = {
        ...payroll,
        commissionEarned,
        bonus,
        deductions,
        netPay,
        generatedAt: new Date().toISOString(),
        generatedBy: user.name || user.email
      };

      await setDoc(doc(db, 'payroll', payroll.id), updatedPayroll);
      
      // Update local state
      setExistingPayrolls(prev => prev.map(p => p.id === payroll.id ? updatedPayroll : p));
    } catch (err: any) {
      console.error('Error updating payroll draft:', err);
      setError('Gagal memperbarui draft payroll: ' + (err.message || String(err)));
    } finally {
      setIsActionLoading(null);
    }
  };

  // Finalize payroll document (lock the numbers)
  const handleFinalize = async (payrollId: string, staffId: string) => {
    setIsActionLoading(`finalize_${staffId}`);
    setError(null);
    try {
      const docRef = doc(db, 'payroll', payrollId);
      await updateDoc(docRef, { 
        status: 'finalized',
        generatedAt: new Date().toISOString(),
        generatedBy: user.name || user.email
      });
      
      // Update local state
      setExistingPayrolls(prev => prev.map(p => p.id === payrollId ? { ...p, status: 'finalized' } : p));
    } catch (err: any) {
      console.error('Error finalizing payroll:', err);
      setError('Gagal mengunci (finalize) payroll: ' + (err.message || String(err)));
    } finally {
      setIsActionLoading(null);
    }
  };

  // Revert payroll document back to draft
  const handleRevertToDraft = async (payrollId: string, staffId: string) => {
    setIsActionLoading(`revert_${staffId}`);
    setError(null);
    try {
      const docRef = doc(db, 'payroll', payrollId);
      await updateDoc(docRef, { status: 'draft' });
      
      // Update local state
      setExistingPayrolls(prev => prev.map(p => p.id === payrollId ? { ...p, status: 'draft' } : p));
    } catch (err: any) {
      console.error('Error reverting payroll to draft:', err);
      setError('Gagal mengembalikan payroll ke draft: ' + (err.message || String(err)));
    } finally {
      setIsActionLoading(null);
    }
  };

  // Mark payroll as paid
  const handleMarkAsPaid = async (payrollId: string, staffId: string) => {
    setIsActionLoading(`pay_${staffId}`);
    setError(null);
    try {
      const docRef = doc(db, 'payroll', payrollId);
      await updateDoc(docRef, { status: 'paid' });
      
      // Update local state
      setExistingPayrolls(prev => prev.map(p => p.id === payrollId ? { ...p, status: 'paid' } : p));
    } catch (err: any) {
      console.error('Error marking payroll as paid:', err);
      setError('Gagal menandai pembayaran payroll: ' + (err.message || String(err)));
    } finally {
      setIsActionLoading(null);
    }
  };

  // Delete a draft payroll document
  const handleDeleteDraft = async (payrollId: string, staffId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus draft payroll ini?')) return;
    
    setIsActionLoading(`delete_${staffId}`);
    setError(null);
    try {
      await deleteDoc(doc(db, 'payroll', payrollId));
      
      // Update local state
      setExistingPayrolls(prev => prev.filter(p => p.id !== payrollId));
    } catch (err: any) {
      console.error('Error deleting payroll draft:', err);
      setError('Gagal menghapus draft payroll: ' + (err.message || String(err)));
    } finally {
      setIsActionLoading(null);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 p-6 md:p-8 overflow-y-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-[#D4AF37] flex items-center justify-center shadow-md">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-sans font-extrabold text-slate-950 uppercase tracking-tight">Payroll & Komisi</h1>
            <p className="text-xs text-slate-500 font-sans mt-0.5">Kelola gaji pokok, perhitungan komisi otomatis, absensi, bonus, dan slip gaji staff.</p>
          </div>
        </div>

        {/* Global Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch Selectors for HKA Management */}
          {isHKA ? (
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-xs">
              <Building2 className="w-4 h-4 text-[#D4AF37]" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value as Exclude<Branch, 'ALL'>)}
                className="text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value="NAO_STUDIO">NAO Studio • Hair & Nails</option>
                <option value="DIAEL_BEAUTY">DIAEL Beauty • Lashes & Spa</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{selectedBranch === 'NAO_STUDIO' ? 'NAO Studio • Hair & Nails' : 'DIAEL Beauty • Lashes & Spa'}</span>
            </div>
          )}

          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-xs">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                if (e.target.value) setSelectedMonth(e.target.value);
              }}
              className="text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer border-none"
            />
          </div>
        </div>
      </div>

      {/* Notifications / Errors */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-700">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
          <div className="flex-1 text-xs font-semibold leading-relaxed">
            {error}
          </div>
          <button onClick={() => setError(null)} className="text-xs font-bold text-rose-500 hover:text-rose-700 cursor-pointer">Tutup</button>
        </div>
      )}

      {/* Section Tabs (Therapists vs Managers) */}
      {isHKA && (
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('therapists')}
            className={`px-5 py-3 text-xs font-bold transition-all relative ${
              activeTab === 'therapists' 
                ? 'text-slate-950 font-extrabold' 
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            Terapis (Therapists)
            {activeTab === 'therapists' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('managers')}
            className={`px-5 py-3 text-xs font-bold transition-all relative ${
              activeTab === 'managers' 
                ? 'text-slate-950 font-extrabold' 
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            Manajer (Salon Managers)
            {activeTab === 'managers' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D4AF37]" />
            )}
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 shadow-xs flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
          <p className="text-xs text-slate-400 font-bold font-mono uppercase tracking-wider">Memuat data payroll...</p>
        </div>
      ) : activeTab === 'therapists' ? (
        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-mono">Daftar Payroll Terapis - {selectedMonth}</h3>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-bold font-mono">
              {therapists.length} Terapis terdaftar
            </span>
          </div>

          {therapists.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 flex items-center justify-center rounded-full mx-auto">
                <UserCheck className="w-6 h-6" />
              </div>
              <p className="text-xs text-slate-500 font-medium">Tidak ada data terapis di cabang {selectedBranch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty'}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-extrabold font-mono uppercase tracking-wider bg-slate-50/30">
                    <th className="p-4 pl-6">Terapis</th>
                    <th className="p-4 text-center">Kehadiran (Days)</th>
                    <th className="p-4 text-right">Gaji Pokok<span className="block normal-case font-normal text-[8px] text-slate-300">Tarif Harian &times; Hari Kerja</span></th>
                    <th className="p-4 text-right">Komisi</th>
                    <th className="p-4 text-center w-36">Bonus</th>
                    <th className="p-4 text-center w-36">Potongan</th>
                    <th className="p-4 text-right font-bold text-slate-800">Gaji Bersih</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 pr-6 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {therapists.map(therapist => {
                    const existing = existingPayrolls.find(p => p.staffId === therapist.id && p.staffType === 'therapist');
                    const preview = calculatedPreviews[therapist.id] || { baseSalary: therapist.baseSalary || 0, commissionEarned: 0, daysPresent: 0 };
                    
                    const isSaved = !!existing;
                    const status = existing ? existing.status : 'preview';
                    
                    const baseSalary = isSaved ? existing.baseSalary : preview.baseSalary;
                    const commissionEarned = isSaved ? existing.commissionEarned : preview.commissionEarned;
                    const daysPresent = isSaved ? existing.daysPresent : preview.daysPresent;
                    
                    const input = manualInputs[therapist.id] || { bonus: 0, deductions: 0 };
                    const bonus = input.bonus || 0;
                    const deductions = input.deductions || 0;
                    const netPay = Math.max(0, baseSalary + commissionEarned + bonus - deductions);

                    const isEditable = status === 'preview' || status === 'draft';
                    const isProcessing = isActionLoading === `draft_${therapist.id}` || isActionLoading === `save_${therapist.id}` || isActionLoading === `finalize_${therapist.id}` || isActionLoading === `revert_${therapist.id}` || isActionLoading === `pay_${therapist.id}` || isActionLoading === `delete_${therapist.id}`;

                    return (
                      <tr key={therapist.id} className="hover:bg-slate-50/30 transition-colors">
                        {/* Name */}
                        <td className="p-4 pl-6">
                          <div className="font-bold text-slate-900">{therapist.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {therapist.id} • Komisi: {(therapist.commissionRate * 100).toFixed(0)}% • Harian: {formatIDR(therapist.baseSalary || 0)}</div>
                          {isHKA && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] text-slate-400 font-mono">
                                Total Komisi Terkumpul: {formatIDR(therapist.totalCommissionEarned || 0)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAdjustTotalCommission(therapist)}
                                disabled={isActionLoading === `adjust_commission_${therapist.id}`}
                                title="Sesuaikan total komisi terkumpul (audited)"
                                className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
                              >
                                {isActionLoading === `adjust_commission_${therapist.id}` ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Pencil className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Attendance */}
                        <td className="p-4 text-center font-mono font-bold text-slate-800">
                          {daysPresent} Hari
                        </td>

                        {/* Base Salary */}
                        <td className="p-4 text-right font-mono text-slate-600">
                          {formatIDR(baseSalary)}
                          <div className="text-[9px] text-slate-400 font-mono normal-case mt-0.5">
                            {formatIDR(therapist.baseSalary || 0)}/hari &times; {daysPresent} hari
                          </div>
                        </td>

                        {/* Commission */}
                        <td className="p-4 text-right font-mono text-slate-600">
                          {formatIDR(commissionEarned)}
                        </td>

                        {/* Bonus Input */}
                        <td className="p-4 text-center">
                          {isEditable ? (
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1 max-w-[120px] mx-auto">
                              <span className="text-[10px] text-slate-400 px-1 font-bold">Rp</span>
                              <input
                                type="number"
                                value={input.bonus || ''}
                                placeholder="0"
                                onChange={(e) => handleInputChange(therapist.id, 'bonus', Number(e.target.value))}
                                className="w-full text-right bg-transparent focus:outline-hidden font-mono text-xs p-0 border-none font-bold"
                              />
                            </div>
                          ) : (
                            <span className="font-mono text-emerald-600 font-bold">+{formatIDR(existing ? existing.bonus : 0)}</span>
                          )}
                        </td>

                        {/* Deductions Input */}
                        <td className="p-4 text-center">
                          {isEditable ? (
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1 max-w-[120px] mx-auto">
                              <span className="text-[10px] text-slate-400 px-1 font-bold">Rp</span>
                              <input
                                type="number"
                                value={input.deductions || ''}
                                placeholder="0"
                                onChange={(e) => handleInputChange(therapist.id, 'deductions', Number(e.target.value))}
                                className="w-full text-right bg-transparent focus:outline-hidden font-mono text-xs p-0 border-none font-bold text-rose-600"
                              />
                            </div>
                          ) : (
                            <span className="font-mono text-rose-500 font-bold">-{formatIDR(existing ? existing.deductions : 0)}</span>
                          )}
                        </td>

                        {/* Net Pay */}
                        <td className="p-4 text-right font-mono font-extrabold text-slate-900 text-sm">
                          {formatIDR(status === 'preview' ? netPay : (existing ? existing.netPay : netPay))}
                        </td>

                        {/* Status Badge */}
                        <td className="p-4 text-center">
                          {status === 'preview' ? (
                            <span className="text-[9px] bg-amber-50 text-amber-700 font-bold border border-amber-200 px-2 py-1 rounded-full uppercase">Preview</span>
                          ) : status === 'draft' ? (
                            <span className="text-[9px] bg-sky-50 text-sky-700 font-bold border border-sky-200 px-2 py-1 rounded-full uppercase">Draft</span>
                          ) : status === 'finalized' ? (
                            <span className="text-[9px] bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 px-2 py-1 rounded-full uppercase flex items-center justify-center gap-1 max-w-[90px] mx-auto">
                              <Lock className="w-3 h-3" /> Locked
                            </span>
                          ) : (
                            <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 px-2 py-1 rounded-full uppercase flex items-center justify-center gap-1 max-w-[90px] mx-auto">
                              <Check className="w-3 h-3" /> Paid
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isProcessing ? (
                              <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                            ) : status === 'preview' ? (
                              <button
                                onClick={() => handleGenerateDraft(therapist.id, therapist.name, 'therapist')}
                                className="bg-slate-900 hover:bg-slate-800 text-white font-sans text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all shadow-xs flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" /> Draft
                              </button>
                            ) : status === 'draft' ? (
                              <>
                                <button
                                  onClick={() => handleSaveDraftChanges(existing!)}
                                  className="bg-sky-50 hover:bg-sky-100 text-sky-700 font-sans text-[10px] font-bold p-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                                  title="Simpan Perubahan"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleFinalize(existing!.id, therapist.id)}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans text-[10px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all shadow-xs flex items-center gap-1"
                                >
                                  <Lock className="w-3 h-3" /> Kunci
                                </button>
                                <button
                                  onClick={() => handleDeleteDraft(existing!.id, therapist.id)}
                                  className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-sans text-[10px] font-bold p-1.5 rounded-lg cursor-pointer transition-all"
                                  title="Hapus Draft"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : status === 'finalized' ? (
                              <>
                                <button
                                  onClick={() => handleMarkAsPaid(existing!.id, therapist.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-sans text-[10px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all shadow-xs flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" /> Bayar
                                </button>
                                <button
                                  onClick={() => handleRevertToDraft(existing!.id, therapist.id)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-sans text-[10px] font-bold p-1.5 rounded-lg cursor-pointer transition-all"
                                  title="Kembalikan ke Draft"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg">
                                <Check className="w-3.5 h-3.5" /> Selesai
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Salon Managers Section (HKA Management only) */
        <div className="bg-white rounded-3xl border border-slate-200/60 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider font-mono">Daftar Payroll Salon Manager - {selectedMonth}</h3>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-bold font-mono">
              {managers.length} Manajer terdaftar
            </span>
          </div>

          {managers.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 flex items-center justify-center rounded-full mx-auto">
                <UserCheck className="w-6 h-6" />
              </div>
              <p className="text-xs text-slate-500 font-medium">Tidak ada data Salon Manager di cabang {selectedBranch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty'}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-extrabold font-mono uppercase tracking-wider bg-slate-50/30">
                    <th className="p-4 pl-6">Manajer</th>
                    <th className="p-4 text-center">Kehadiran (Days)</th>
                    <th className="p-4 text-right">Gaji Pokok</th>
                    <th className="p-4 text-center w-48">Komisi (Isi Manual)</th>
                    <th className="p-4 text-center w-36">Bonus</th>
                    <th className="p-4 text-center w-36">Potongan</th>
                    <th className="p-4 text-right font-bold text-slate-800">Gaji Bersih</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 pr-6 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {managers.map(manager => {
                    const existing = existingPayrolls.find(p => p.staffId === manager.id && p.staffType === 'manager');
                    const preview = calculatedPreviews[manager.id] || { baseSalary: 0, commissionEarned: 0, daysPresent: 0 };
                    
                    const isSaved = !!existing;
                    const status = existing ? existing.status : 'preview';
                    
                    const baseSalary = isSaved ? existing.baseSalary : (preview.baseSalary || 0);
                    const daysPresent = isSaved ? existing.daysPresent : preview.daysPresent;
                    
                    const input = manualInputs[manager.id] || { bonus: 0, deductions: 0, commissionEarned: 0 };
                    
                    const commissionEarned = isSaved ? existing.commissionEarned : (input.commissionEarned || 0);
                    const bonus = input.bonus || 0;
                    const deductions = input.deductions || 0;
                    const netPay = Math.max(0, baseSalary + commissionEarned + bonus - deductions);

                    const isEditable = status === 'preview' || status === 'draft';
                    const isProcessing = isActionLoading === `draft_${manager.id}` || isActionLoading === `save_${manager.id}` || isActionLoading === `finalize_${manager.id}` || isActionLoading === `revert_${manager.id}` || isActionLoading === `pay_${manager.id}` || isActionLoading === `delete_${manager.id}`;

                    return (
                      <tr key={manager.id} className="hover:bg-slate-50/30 transition-colors">
                        {/* Name */}
                        <td className="p-4 pl-6">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900">{manager.name}</span>
                            {linkedTherapistsByUserId[manager.id] && (
                              <span
                                className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-bold font-mono uppercase"
                                title={`Juga terdaftar sebagai therapist (id: ${linkedTherapistsByUserId[manager.id].id}) - lihat payroll komisinya di tab Terapis`}
                              >
                                Dual-role
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">Email: {manager.email} • ID: {manager.id}</div>
                        </td>

                        {/* Attendance */}
                        <td className="p-4 text-center font-mono font-bold text-slate-800">
                          {daysPresent} Hari
                        </td>

                        {/* Base Salary */}
                        <td className="p-4 text-right font-mono text-slate-700 font-medium">
                          {formatIDR(baseSalary)}
                          {baseSalary === 0 && (
                            <span className="block text-[9px] text-slate-400 font-mono normal-case">Belum diatur di sheet Managers</span>
                          )}
                        </td>

                        {/* Manual Commission Input */}
                        <td className="p-4 text-center">
                          {isEditable ? (
                            <div className="flex items-center bg-white border border-amber-300 rounded-lg p-1.5 max-w-[150px] mx-auto shadow-xs">
                              <span className="text-[10px] text-slate-400 px-1 font-bold">Rp</span>
                              <input
                                type="number"
                                value={input.commissionEarned || ''}
                                placeholder="Komisi manual"
                                onChange={(e) => handleInputChange(manager.id, 'commissionEarned', Number(e.target.value))}
                                className="w-full text-right bg-transparent focus:outline-hidden font-mono text-xs p-0 border-none font-bold text-slate-800"
                              />
                            </div>
                          ) : (
                            <span className="font-mono text-slate-700 font-bold">{formatIDR(commissionEarned)}</span>
                          )}
                          {!!manager.commissionRate && (
                            <span className="block text-[9px] text-slate-400 font-mono mt-1">
                              Rate acuan di sheet: {(manager.commissionRate * 100).toFixed(0)}%
                            </span>
                          )}
                        </td>

                        {/* Bonus Input */}
                        <td className="p-4 text-center">
                          {isEditable ? (
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1 max-w-[120px] mx-auto">
                              <span className="text-[10px] text-slate-400 px-1 font-bold">Rp</span>
                              <input
                                type="number"
                                value={input.bonus || ''}
                                placeholder="0"
                                onChange={(e) => handleInputChange(manager.id, 'bonus', Number(e.target.value))}
                                className="w-full text-right bg-transparent focus:outline-hidden font-mono text-xs p-0 border-none font-bold"
                              />
                            </div>
                          ) : (
                            <span className="font-mono text-emerald-600 font-bold">+{formatIDR(existing ? existing.bonus : 0)}</span>
                          )}
                        </td>

                        {/* Deductions Input */}
                        <td className="p-4 text-center">
                          {isEditable ? (
                            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1 max-w-[120px] mx-auto">
                              <span className="text-[10px] text-slate-400 px-1 font-bold">Rp</span>
                              <input
                                type="number"
                                value={input.deductions || ''}
                                placeholder="0"
                                onChange={(e) => handleInputChange(manager.id, 'deductions', Number(e.target.value))}
                                className="w-full text-right bg-transparent focus:outline-hidden font-mono text-xs p-0 border-none font-bold text-rose-600"
                              />
                            </div>
                          ) : (
                            <span className="font-mono text-rose-500 font-bold">-{formatIDR(existing ? existing.deductions : 0)}</span>
                          )}
                        </td>

                        {/* Net Pay */}
                        <td className="p-4 text-right font-mono font-extrabold text-slate-900 text-sm">
                          {formatIDR(status === 'preview' ? netPay : (existing ? existing.netPay : netPay))}
                        </td>

                        {/* Status Badge */}
                        <td className="p-4 text-center">
                          {status === 'preview' ? (
                            <span className="text-[9px] bg-amber-50 text-amber-700 font-bold border border-amber-200 px-2 py-1 rounded-full uppercase">Preview</span>
                          ) : status === 'draft' ? (
                            <span className="text-[9px] bg-sky-50 text-sky-700 font-bold border border-sky-200 px-2 py-1 rounded-full uppercase">Draft</span>
                          ) : status === 'finalized' ? (
                            <span className="text-[9px] bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 px-2 py-1 rounded-full uppercase flex items-center justify-center gap-1 max-w-[90px] mx-auto">
                              <Lock className="w-3 h-3" /> Locked
                            </span>
                          ) : (
                            <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 px-2 py-1 rounded-full uppercase flex items-center justify-center gap-1 max-w-[90px] mx-auto">
                              <Check className="w-3 h-3" /> Paid
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isProcessing ? (
                              <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                            ) : status === 'preview' ? (
                              <button
                                onClick={() => handleGenerateDraft(manager.id, manager.name, 'manager')}
                                className="bg-slate-900 hover:bg-slate-800 text-white font-sans text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all shadow-xs flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" /> Draft
                              </button>
                            ) : status === 'draft' ? (
                              <>
                                <button
                                  onClick={() => handleSaveDraftChanges(existing!)}
                                  className="bg-sky-50 hover:bg-sky-100 text-sky-700 font-sans text-[10px] font-bold p-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-1"
                                  title="Simpan Perubahan"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleFinalize(existing!.id, manager.id)}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans text-[10px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all shadow-xs flex items-center gap-1"
                                >
                                  <Lock className="w-3 h-3" /> Kunci
                                </button>
                                <button
                                  onClick={() => handleDeleteDraft(existing!.id, manager.id)}
                                  className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-sans text-[10px] font-bold p-1.5 rounded-lg cursor-pointer transition-all"
                                  title="Hapus Draft"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : status === 'finalized' ? (
                              <>
                                <button
                                  onClick={() => handleMarkAsPaid(existing!.id, manager.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-sans text-[10px] font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all shadow-xs flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" /> Bayar
                                </button>
                                <button
                                  onClick={() => handleRevertToDraft(existing!.id, manager.id)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-sans text-[10px] font-bold p-1.5 rounded-lg cursor-pointer transition-all"
                                  title="Kembalikan ke Draft"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg">
                                <Check className="w-3.5 h-3.5" /> Selesai
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
