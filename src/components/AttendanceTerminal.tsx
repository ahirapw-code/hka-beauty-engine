import React, { useState, useEffect } from 'react';
import { User, Attendance } from '../types';
import { 
  Clock, 
  Play, 
  Square, 
  CalendarDays, 
  History, 
  Sparkles, 
  ClipboardSignature 
} from 'lucide-react';

interface AttendanceTerminalProps {
  user: User;
  attendance: Attendance[];
  onAddAttendance: (newAtt: Omit<Attendance, 'id'>) => void;
  onUpdateAttendance: (id: string, clockOut: string, notes?: string) => void;
}

// Shared by both the mobile card list and the desktop table so the two
// views can never drift out of sync with each other.
function getDurationText(att: Attendance): string {
  if (att.clockIn && att.clockOut) {
    const [inH, inM] = att.clockIn.split(':').map(Number);
    const [outH, outM] = att.clockOut.split(':').map(Number);
    const diffHrs = (outH - inH) + (outM - inM) / 60;
    if (diffHrs > 0) {
      const hrs = Math.floor(diffHrs);
      const mins = Math.round((diffHrs - hrs) * 60);
      return `${hrs}h ${mins}m`;
    }
  } else if (att.status === 'active') {
    return 'In Progress';
  }
  return '--';
}

export default function AttendanceTerminal({
  user,
  attendance,
  onAddAttendance,
  onUpdateAttendance
}: AttendanceTerminalProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [shiftNotes, setShiftNotes] = useState('');

  // Tick the clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Find active shift for the current logged-in user
  const activeShift = attendance.find(att => att.userId === user.id && att.status === 'active');

  // Filter attendance to only show this user's records
  const myLogs = attendance.filter(att => att.userId === user.id);

  const handleClockIn = () => {
    const dateStr = currentTime.toISOString().substring(0, 10);
    const timeStr = currentTime.toLocaleTimeString('en-US', { hour12: false });
    
    onAddAttendance({
      userId: user.id,
      userName: user.name,
      role: user.role,
      branch: user.branch as 'NAO_STUDIO' | 'DIAEL_BEAUTY', // User's home branch
      date: dateStr,
      clockIn: timeStr,
      status: 'active',
      notes: ''
    });
    setShiftNotes('');
  };

  const handleClockOut = () => {
    if (!activeShift) return;
    const timeStr = currentTime.toLocaleTimeString('en-US', { hour12: false });
    onUpdateAttendance(activeShift.id, timeStr, shiftNotes || 'Shift completed standard check-out');
    setShiftNotes('');
  };

  return (
    <div id="attendance-terminal-module" className="grid grid-cols-1 xl:grid-cols-12 gap-8 animate-fade-in">
      
      {/* Clock-in Terminal Hub */}
      <div className="xl:col-span-5 flex flex-col gap-6">
        
        {/* Terminal Card */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
          {/* Subtle gold ribbon top border */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB]" />

          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">
            HKA Operational Terminal
          </span>

          {/* Current Time Display */}
          <div className="my-6 sm:my-8">
            <span className="text-3xl sm:text-4xl font-mono font-bold text-slate-800 tracking-tight block">
              {currentTime.toLocaleTimeString('en-US', { hour12: false })}
            </span>
            <span className="text-xs text-slate-400 font-sans mt-1 block">
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>

          {/* Status Badge */}
          <div className="mb-8">
            {activeShift ? (
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100/80 text-xs font-bold font-mono">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                ON ACTIVE SHIFT
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-50 text-slate-500 border border-slate-100 text-xs font-bold font-mono">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                OFF SHIFT
              </span>
            )}
          </div>

          {/* Terminal Action Flow */}
          <div className="w-full space-y-4">
            {activeShift ? (
              <div className="space-y-4 text-left w-full">
                <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-100/60 text-xs text-emerald-800 space-y-1">
                  <p className="font-bold">Shift Started:</p>
                  <p className="font-mono text-emerald-900 text-sm">{activeShift.date} at {activeShift.clockIn}</p>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">SHIFT LOG NOTES</label>
                  <textarea
                    value={shiftNotes}
                    onChange={(e) => setShiftNotes(e.target.value)}
                    placeholder="Describe treatments completed, retail sales, or general salon hand-over comments..."
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-100 hover:border-slate-200 focus:border-slate-300 rounded-2xl text-xs bg-slate-50/50 focus:bg-white focus:outline-none resize-none transition-all"
                  />
                </div>

                <button
                  onClick={handleClockOut}
                  className="w-full py-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-700 active:scale-[0.98] text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer touch-manipulation shadow-md shadow-rose-200"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Clock Out of Shift</span>
                </button>
              </div>
            ) : (
              <div className="space-y-6 w-full">
                <p className="text-xs text-slate-400 px-4">
                  Please confirm you are physically at <strong className="text-slate-700 font-medium">{user.branch.replace('_', ' ')}</strong> before clocking in.
                </p>

                <button
                  onClick={handleClockIn}
                  className="w-full py-4 bg-[#1a1c1e] hover:bg-slate-800 active:bg-slate-800 active:scale-[0.98] text-[#D4AF37] font-bold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer touch-manipulation shadow-md shadow-slate-200"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Clock In to Shift</span>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Home Branch Scope Info */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-slate-100 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardSignature className="w-5 h-5 text-[#D4AF37]" />
            <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Terminal Policies</h4>
          </div>
          <ul className="text-[11px] text-slate-400 space-y-2 list-disc list-inside">
            <li>Shift durations are logged in UTC to ensure cross-border synchronization.</li>
            <li>Clock-out notes are logged in CRM profiles and performance trackers automatically.</li>
            <li>Forgot to check out? Request manual adjustment from your branch manager.</li>
          </ul>
        </div>

      </div>

      {/* Shifts History Log */}
      <div className="xl:col-span-7 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
        <div className="pb-4 border-b border-slate-100 flex items-center gap-3">
          <div className="p-2.5 bg-slate-50 text-slate-600 rounded-xl">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">My Timesheet History</h3>
            <p className="text-xs text-slate-400 mt-0.5">Your personal logged hours and timesheet audits.</p>
          </div>
        </div>

        {/* History - card list on mobile (a table here would force sideways
            scrolling on a phone), real table from md breakpoint up. */}
        {myLogs.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs rounded-2xl border border-slate-100 bg-slate-50/40">
            No timesheet logs logged on this account yet.
          </div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="md:hidden space-y-2.5">
              {myLogs.map((att) => {
                const durationText = getDurationText(att);
                return (
                  <div key={att.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 font-mono">{att.date}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium ${
                        att.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {att.status === 'active' ? 'Active' : 'Completed'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white rounded-xl border border-slate-100 py-2">
                        <span className="block text-[9px] text-slate-400 font-mono uppercase">In</span>
                        <span className="block text-xs font-mono font-semibold text-slate-700 mt-0.5">{att.clockIn}</span>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-100 py-2">
                        <span className="block text-[9px] text-slate-400 font-mono uppercase">Out</span>
                        <span className="block text-xs font-mono font-semibold text-slate-700 mt-0.5">{att.clockOut || '--:--:--'}</span>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-100 py-2">
                        <span className="block text-[9px] text-slate-400 font-mono uppercase">Duration</span>
                        <span className="block text-xs font-mono font-semibold text-slate-700 mt-0.5">{durationText}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Table from md breakpoint up */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                    <th className="py-3 px-4">Shift Date</th>
                    <th className="py-3 px-4">Clock In</th>
                    <th className="py-3 px-4">Clock Out</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
                  {myLogs.map((att) => {
                    const durationText = getDurationText(att);
                    return (
                      <tr key={att.id} className="hover:bg-slate-50/20">
                        <td className="py-3.5 px-4 font-medium text-slate-800 font-mono">
                          {att.date}
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {att.clockIn}
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {att.clockOut || '--:--:--'}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-medium">
                          {durationText}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium ${
                            att.status === 'active' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                              : 'bg-slate-50 text-slate-600 border border-slate-100'
                          }`}>
                            {att.status === 'active' ? 'Active' : 'Completed'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
