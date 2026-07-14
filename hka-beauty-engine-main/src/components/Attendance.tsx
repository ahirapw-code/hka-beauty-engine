import React, { useState, useMemo } from 'react';
import { User, Branch, Attendance, Role } from '../types';
import { 
  Clock, 
  Plus, 
  Search, 
  Building2, 
  Calendar, 
  CheckCircle, 
  UserCheck, 
  LogOut, 
  AlertCircle,
  FileSpreadsheet,
  Clock3,
  UserX
} from 'lucide-react';

interface AttendanceProps {
  user: User;
  selectedBranch: Branch;
  attendance: Attendance[];
  onAddAttendance: (newAtt: Omit<Attendance, 'id'>) => void;
  onUpdateAttendance: (id: string, clockOut: string, notes?: string) => void;
}

export default function AttendanceComponent({
  user,
  selectedBranch,
  attendance,
  onAddAttendance,
  onUpdateAttendance
}: AttendanceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterRole, setFilterRole] = useState<Role | 'ALL'>('ALL');

  // Manual record form state
  const [manualName, setManualName] = useState('');
  const [manualRole, setManualRole] = useState<Role>('THERAPIST');
  const [manualBranch, setManualBranch] = useState<'NAO_STUDIO' | 'DIAEL_BEAUTY'>(
    user.branch === 'ALL' ? 'NAO_STUDIO' : user.branch as 'NAO_STUDIO' | 'DIAEL_BEAUTY'
  );
  const [manualDate, setManualDate] = useState(new Date().toISOString().substring(0, 10));
  const [manualIn, setManualIn] = useState('09:00');
  const [manualOut, setManualOut] = useState('18:00');
  const [manualNotes, setManualNotes] = useState('');

  // Handle active branch filtering based on user role operational scope
  const activeBranchFilter = user.role === 'SALON_MANAGER' ? user.branch : selectedBranch;

  const filteredAttendance = useMemo(() => {
    return attendance.filter(att => {
      const matchesSearch = att.userName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            att.userId.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesBranch = activeBranchFilter === 'ALL' || att.branch === activeBranchFilter;
      const matchesRole = filterRole === 'ALL' || att.role === filterRole;

      return matchesSearch && matchesBranch && matchesRole;
    });
  }, [attendance, searchQuery, activeBranchFilter, filterRole]);

  // Compute stats
  const stats = useMemo(() => {
    const branchAtt = attendance.filter(att => activeBranchFilter === 'ALL' || att.branch === activeBranchFilter);
    const activeShifts = branchAtt.filter(att => att.status === 'active');
    const completedShifts = branchAtt.filter(att => att.status === 'completed');
    
    return {
      activeCount: activeShifts.length,
      completedCount: completedShifts.length,
      totalHours: completedShifts.reduce((acc, curr) => {
        if (curr.clockIn && curr.clockOut) {
          const [inH, inM] = curr.clockIn.split(':').map(Number);
          const [outH, outM] = curr.clockOut.split(':').map(Number);
          const diffHrs = (outH - inH) + (outM - inM) / 60;
          return acc + (diffHrs > 0 ? diffHrs : 0);
        }
        return acc;
      }, 0)
    };
  }, [attendance, activeBranchFilter]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName || !manualIn || !manualOut) return;

    onAddAttendance({
      userId: 'u_manual_' + Math.floor(Math.random() * 900 + 100),
      userName: manualName,
      role: manualRole,
      branch: manualBranch,
      date: manualDate,
      clockIn: manualIn + ':00',
      clockOut: manualOut + ':00',
      status: 'completed',
      notes: manualNotes || 'Manually entered by manager'
    });

    // Reset Form
    setManualName('');
    setManualNotes('');
    setShowAddModal(false);
  };

  const handleManualClockOut = (id: string) => {
    const nowTime = new Date().toLocaleTimeString('en-US', { hour12: false });
    onUpdateAttendance(id, nowTime, 'Clocked out manually by Administrator');
  };

  return (
    <div id="attendance-manager" className="space-y-8 animate-fade-in">
      
      {/* Page Title & Manual Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 font-serif">Staff Attendance Ledger</h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time visual monitoring of therapist shifts, logged hours, and branch clocking audits.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-[#1a1c1e] hover:bg-slate-800 text-[#D4AF37] font-bold text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-sm self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Manual Log Adjustment</span>
        </button>
      </div>

      {/* Corporate Dashboard Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex items-center gap-5">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <UserCheck className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono block">On Duty Today</span>
            <span className="text-2xl font-bold text-slate-800 font-serif mt-1 block">
              {stats.activeCount} <span className="text-xs text-slate-400 font-sans font-normal">Active staff</span>
            </span>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex items-center gap-5">
          <div className="p-4 bg-amber-50 text-[#D4AF37] rounded-2xl">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono block">Shifts Completed</span>
            <span className="text-2xl font-bold text-slate-800 font-serif mt-1 block">
              {stats.completedCount} <span className="text-xs text-slate-400 font-sans font-normal">Completed</span>
            </span>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex items-center gap-5">
          <div className="p-4 bg-sky-50 text-sky-600 rounded-2xl">
            <Clock3 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono block">Total Shift Hours</span>
            <span className="text-2xl font-bold text-slate-800 font-serif mt-1 block">
              {Math.round(stats.totalHours * 10) / 10} <span className="text-xs text-slate-400 font-sans font-normal">Hours logged</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Active Shift Realtime Monitor */}
        <div className="xl:col-span-4 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm flex flex-col h-fit">
          <div className="pb-4 border-b border-slate-100 mb-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span>Real-Time Active Shifts</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">Currently clocked-in staff on site.</p>
          </div>

          <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
            {attendance.filter(att => att.status === 'active' && (activeBranchFilter === 'ALL' || att.branch === activeBranchFilter)).length === 0 ? (
              <div className="py-8 text-center text-slate-400 space-y-2">
                <UserX className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-mono">No active staff clocked in.</p>
              </div>
            ) : (
              attendance
                .filter(att => att.status === 'active' && (activeBranchFilter === 'ALL' || att.branch === activeBranchFilter))
                .map((att) => (
                  <div key={att.id} className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-100/60 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">{att.userName}</h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{att.role.toLowerCase().replace('_', ' ')} • {att.branch.replace('_', ' ')}</p>
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] font-mono text-emerald-700 bg-emerald-50 w-fit px-2 py-0.5 rounded">
                        <Clock className="w-3 h-3" />
                        <span>In: {att.clockIn}</span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleManualClockOut(att.id)}
                      className="px-2.5 py-1.5 hover:bg-rose-50 border border-transparent hover:border-rose-100 text-rose-600 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                      title="Force Clock Out"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Clock Out</span>
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Attendance Log Directory */}
        <div className="xl:col-span-8 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4 flex flex-col">
          
          {/* Header & filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">Shift Registry & Auditing</h3>
              <p className="text-xs text-slate-400 mt-0.5">Filter, audit, and analyze employee timesheet compliance.</p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value as Role | 'ALL')}
                className="px-3 py-1.5 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-600 focus:outline-none bg-white cursor-pointer"
              >
                <option value="ALL">All Roles</option>
                <option value="HKA_MANAGEMENT">HKA Management</option>
                <option value="SALON_MANAGER">Salon Manager</option>
                <option value="THERAPIST">Therapist</option>
              </select>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff names or user IDs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 border border-slate-100 hover:border-slate-200 focus:border-slate-300 rounded-2xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none transition-all"
            />
          </div>

          {/* Timesheet Directory Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Role / Branch</th>
                  <th className="py-3 px-4">Shift Date</th>
                  <th className="py-3 px-4">Clocked In</th>
                  <th className="py-3 px-4">Clocked Out</th>
                  <th className="py-3 px-4">Total Time</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400">
                      No timesheet records found for the current selection.
                    </td>
                  </tr>
                ) : (
                  filteredAttendance.map((att) => {
                    // Compute shift duration
                    let durationText = '--';
                    if (att.clockIn && att.clockOut) {
                      const [inH, inM] = att.clockIn.split(':').map(Number);
                      const [outH, outM] = att.clockOut.split(':').map(Number);
                      const diffHrs = (outH - inH) + (outM - inM) / 60;
                      if (diffHrs > 0) {
                        const hrs = Math.floor(diffHrs);
                        const mins = Math.round((diffHrs - hrs) * 60);
                        durationText = `${hrs}h ${mins}m`;
                      }
                    } else if (att.status === 'active') {
                      durationText = 'In Progress';
                    }

                    return (
                      <tr key={att.id} className="hover:bg-slate-50/40 transition-all">
                        <td className="py-3.5 px-4 font-bold text-slate-800">
                          {att.userName}
                          <span className="block text-[10px] font-mono text-slate-400 font-normal mt-0.5">{att.userId}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          <span className="capitalize">{att.role.toLowerCase().replace('_', ' ')}</span>
                          <span className="block text-[10px] font-mono text-slate-400 mt-0.5">{att.branch.replace('_', ' ')}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-mono">
                          {att.date}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-mono">
                          {att.clockIn}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-mono">
                          {att.clockOut || '--:--:--'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`font-mono text-xs ${att.status === 'active' ? 'text-emerald-600 font-medium' : 'text-slate-700'}`}>
                            {durationText}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            att.status === 'active' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                              : 'bg-slate-50 text-slate-600 border border-slate-100'
                          }`}>
                            {att.status === 'active' ? 'Active Duty' : 'Completed'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Manual Entry Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="p-6 bg-slate-900 text-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-base text-[#D4AF37]">Manual Timesheet Adjustment</h3>
                <p className="text-[11px] text-slate-400 mt-1">Log backdated attendance records or adjust errors.</p>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white transition-all cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">STAFF FULL NAME *</label>
                  <input
                    type="text"
                    required
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="e.g. Rachel Chen"
                    className="w-full px-4 py-2 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:border-slate-300"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">ROLE TYPE *</label>
                  <select
                    value={manualRole}
                    onChange={(e) => setManualRole(e.target.value as Role)}
                    className="w-full px-4 py-2 border border-slate-200/80 rounded-xl text-xs focus:outline-none bg-white cursor-pointer"
                  >
                    <option value="THERAPIST">Therapist</option>
                    <option value="SALON_MANAGER">Salon Manager</option>
                    <option value="HKA_MANAGEMENT">HKA HQ Corporate</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">BRANCH *</label>
                  <select
                    value={manualBranch}
                    onChange={(e) => setManualBranch(e.target.value as 'NAO_STUDIO' | 'DIAEL_BEAUTY')}
                    className="w-full px-4 py-2 border border-slate-200/80 rounded-xl text-xs focus:outline-none bg-white cursor-pointer"
                  >
                    <option value="NAO_STUDIO">NAO Studio (Hair & Nails)</option>
                    <option value="DIAEL_BEAUTY">DIAEL Beauty (Lash & Spa)</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">SHIFT DATE *</label>
                  <input
                    type="date"
                    required
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:border-slate-300"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">CLOCK IN TIME *</label>
                  <input
                    type="time"
                    required
                    value={manualIn}
                    onChange={(e) => setManualIn(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:border-slate-300"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">CLOCK OUT TIME *</label>
                  <input
                    type="time"
                    required
                    value={manualOut}
                    onChange={(e) => setManualOut(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:border-slate-300"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">AUDIT CORRECTION NOTES</label>
                  <textarea
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    placeholder="e.g. Forgotten checkout on Sunday shift. Corrected by manager."
                    rows={2}
                    className="w-full px-4 py-2 border border-slate-200/80 rounded-xl text-xs focus:outline-none focus:border-slate-300 resize-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs hover:bg-slate-50 font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1a1c1e] text-[#D4AF37] rounded-xl text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer shadow-sm"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
