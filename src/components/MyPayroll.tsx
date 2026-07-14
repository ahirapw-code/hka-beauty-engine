import React, { useState, useEffect } from 'react';
import { User, Payroll } from '../types';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy } from '../lib/firestoreClient';
import { formatIDR } from '../utils';
import { 
  Wallet, 
  Calendar, 
  Building2, 
  FileText, 
  Check, 
  Clock, 
  AlertCircle, 
  Loader2, 
  Download, 
  ArrowLeft 
} from 'lucide-react';

interface MyPayrollProps {
  user: User;
}

export default function MyPayroll({ user }: MyPayrollProps) {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMyPayrolls = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const payrollRef = collection(db, 'payroll');
        // Simple query without complex indexes, then sort in memory to avoid index requirement issues
        const q = query(
          payrollRef,
          where('staffId', '==', user.id)
        );
        const snap = await getDocs(q);
        const list: Payroll[] = [];
        snap.forEach(d => {
          list.push(d.data() as Payroll);
        });
        
        // Sort in memory by periodMonth desc
        list.sort((a, b) => b.periodMonth.localeCompare(a.periodMonth));

        setPayrolls(list);
        if (list.length > 0) {
          setSelectedPayroll(list[0]);
        }
      } catch (err: any) {
        console.error('Error fetching my payrolls:', err);
        setError('Gagal memuat slip gaji Anda: ' + (err.message || String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    fetchMyPayrolls();
  }, [user.id]);

  const handlePrint = () => {
    window.print();
  };

  const getBranchName = (b: string) => {
    if (b === 'NAO_STUDIO') return 'NAO Studio • Hair & Nails';
    if (b === 'DIAEL_BEAUTY') return 'DIAEL Beauty • Lashes & Spa';
    return b;
  };

  const formatPeriod = (period: string) => {
    if (!period) return '';
    const [year, month] = period.split('-');
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const monthIndex = parseInt(month, 10) - 1;
    return `${months[monthIndex]} ${year}`;
  };

  return (
    <div className="flex-1 bg-slate-50 p-6 md:p-8 overflow-y-auto space-y-6">
      {/* Header section */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 text-[#D4AF37] flex items-center justify-center shadow-md">
          <Wallet className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-sans font-extrabold text-slate-950 uppercase tracking-tight">Slip Gaji Saya</h1>
          <p className="text-xs text-slate-500 font-sans mt-0.5">Pantau riwayat pembayaran, gaji pokok, komisi layanan, bonus, dan potongan resmi Anda.</p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-700 text-xs font-semibold">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          <div className="flex-1 leading-relaxed">{error}</div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 shadow-xs flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
          <p className="text-xs text-slate-400 font-bold font-mono uppercase tracking-wider">Memuat slip gaji...</p>
        </div>
      ) : payrolls.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-150 p-12 shadow-xs text-center space-y-4 max-w-lg mx-auto">
          <div className="w-16 h-16 bg-slate-50 text-slate-300 flex items-center justify-center rounded-full mx-auto">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Belum Ada Slip Gaji</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Belum ada data slip gaji yang diterbitkan untuk akun Anda pada periode manapun. Hubungi tim Manajemen HKA jika menurut Anda ini adalah kesalahan.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Panel: Payslip History List */}
          <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200/60 shadow-xs overflow-hidden print:hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/60">
              <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider font-mono">Riwayat Gaji Bulanan</h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {payrolls.map(item => {
                const isSelected = selectedPayroll?.id === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedPayroll(item)}
                    className={`w-full text-left p-4 transition-all flex items-center justify-between cursor-pointer ${
                      isSelected 
                        ? 'bg-slate-900 text-white' 
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className={`text-xs font-extrabold uppercase tracking-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {formatPeriod(item.periodMonth)}
                      </div>
                      <div className={`text-[10px] font-mono ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>
                        {getBranchName(item.branch)}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-xs font-bold font-mono">
                        {formatIDR(item.netPay)}
                      </div>
                      <div>
                        {item.status === 'paid' ? (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Paid</span>
                        ) : item.status === 'finalized' ? (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Finalized</span>
                        ) : (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">Draft</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Active Payslip Detail Card */}
          {selectedPayroll && (
            <div className="lg:col-span-8 space-y-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between print:hidden">
                <span className="text-xs text-slate-400 font-semibold font-mono">TAMPILAN DETAIL SLIP GAJI</span>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Cetak / PDF</span>
                </button>
              </div>

              {/* Physical Payslip Sheet Design */}
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-8 md:p-10 space-y-8 print:border-none print:shadow-none print:p-0">
                {/* Payslip Header */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-slate-200 pb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#D4AF37] to-[#F3E5AB] flex items-center justify-center shadow-md">
                      <span className="font-serif font-extrabold text-[#1a1c1e] text-xl">H</span>
                    </div>
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 tracking-tight font-sans">HKA ENGINE OS</h2>
                      <p className="text-xs text-slate-500">{getBranchName(selectedPayroll.branch)}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">SLIP GAJI RESMI KARYAWAN</p>
                    </div>
                  </div>
                  <div className="text-left md:text-right space-y-1">
                    <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full font-bold font-mono tracking-wider uppercase">
                      STATUS: {selectedPayroll.status}
                    </span>
                    <p className="text-xs font-bold text-slate-800 mt-2">Periode {formatPeriod(selectedPayroll.periodMonth)}</p>
                    <p className="text-[9px] text-slate-400 font-mono">Diterbitkan: {new Date(selectedPayroll.generatedAt).toLocaleDateString('id-ID')}</p>
                  </div>
                </div>

                {/* Staff Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 rounded-2xl p-5 border border-slate-100">
                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold font-mono uppercase">Nama Staff</span>
                      <p className="text-xs font-extrabold text-slate-900">{selectedPayroll.staffName}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold font-mono uppercase">Role</span>
                      <p className="text-xs font-bold text-[#D4AF37] uppercase">{selectedPayroll.staffType === 'therapist' ? 'Terapis' : 'Salon Manager'}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold font-mono uppercase">ID Karyawan</span>
                      <p className="text-xs font-bold text-slate-700 font-mono">{selectedPayroll.staffId}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold font-mono uppercase">Total Kehadiran</span>
                      <p className="text-xs font-bold text-slate-700">{selectedPayroll.daysPresent} Hari Kerja</p>
                    </div>
                  </div>
                </div>

                {/* Calculation breakdown */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider font-mono border-b border-slate-100 pb-2">Rincian Perhitungan Gaji</h3>
                  
                  <div className="space-y-3">
                    {/* Gaji Pokok (Only if Therapist, Managers are N/A/0) */}
                    {selectedPayroll.staffType === 'therapist' && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-semibold">Gaji Pokok (Base Salary)</span>
                        <span className="font-mono text-slate-800 font-bold">{formatIDR(selectedPayroll.baseSalary)}</span>
                      </div>
                    )}

                    {/* Komisi */}
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-semibold">Komisi Layanan / Kinerja</span>
                      <span className="font-mono text-slate-800 font-bold">{formatIDR(selectedPayroll.commissionEarned)}</span>
                    </div>

                    {/* Bonus */}
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">Bonus Tambahan</span>
                      <span className="font-mono text-emerald-600 font-bold">+{formatIDR(selectedPayroll.bonus)}</span>
                    </div>

                    {/* Potongan */}
                    <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-4">
                      <span className="text-rose-600 font-semibold flex items-center gap-1">Potongan Resmi</span>
                      <span className="font-mono text-rose-500 font-bold">-{formatIDR(selectedPayroll.deductions)}</span>
                    </div>

                    {/* Net Gaji Bersih */}
                    <div className="flex justify-between items-center pt-2">
                      <div>
                        <span className="text-sm font-extrabold text-slate-900 block">Total Gaji Bersih</span>
                        <span className="text-[10px] text-slate-400 block font-mono">Take Home Pay</span>
                      </div>
                      <span className="font-mono text-lg font-extrabold text-slate-950 bg-amber-500/5 border border-amber-500/20 px-4 py-2 rounded-xl text-right">
                        {formatIDR(selectedPayroll.netPay)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payslip Footer Verification Info */}
                <div className="border-t border-slate-100 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] text-slate-400 font-mono">
                  <div>
                    <p>VERIFIED BY HKA ENGINE OS</p>
                    <p className="mt-0.5">Disetujui Oleh: {selectedPayroll.generatedBy}</p>
                  </div>
                  <div className="text-left md:text-right">
                    <p>ID Transaksi: {selectedPayroll.id}</p>
                    <p className="mt-0.5">Copyright © {new Date().getFullYear()} Haris Krisna Aesthetic</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
