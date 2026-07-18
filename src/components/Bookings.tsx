import React, { useState, useMemo, useEffect } from 'react';
import { User, Branch, Booking, Customer, Service, Therapist } from '../types';
import { formatIDR } from '../utils';
import { Calendar, Plus, Clock, UserCheck, ShieldAlert, CheckCircle, Trash2, CheckCircle2 } from 'lucide-react';

const timeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minutesToTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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

// Fixed treatment list — no longer pulled from the Services collection.
// Duration is intentionally NOT stored here: staff enters it manually per
// booking and picks an available therapist to match.
interface TreatmentOption {
  id: string;
  name: string;
  branches: Exclude<Branch, 'ALL'>[];
}

const TREATMENT_OPTIONS: TreatmentOption[] = [
  { id: 'hand_nails_treatment', name: 'Hand Nails Treatment', branches: ['NAO_STUDIO', 'DIAEL_BEAUTY'] },
  { id: 'foot_nails_treatment', name: 'Foot Nails Treatment', branches: ['NAO_STUDIO', 'DIAEL_BEAUTY'] },
  { id: 'eyelash', name: 'Eyelash', branches: ['DIAEL_BEAUTY'] },
  { id: 'eyebrow', name: 'Eyebrow', branches: ['DIAEL_BEAUTY'] },
];

interface BookingsProps {
  user: User;
  selectedBranch: Branch;
  bookings: Booking[];
  customers: Customer[];
  services: Service[];
  therapists: Therapist[];
  users: User[];
  onAddBooking: (booking: Omit<Booking, 'id'>) => Promise<void>;
  onUpdateBookingStatus: (id: string, status: 'pending' | 'checked_in' | 'completed' | 'cancelled') => void;
}

export default function Bookings({
  user,
  selectedBranch,
  bookings,
  customers,
  services,
  therapists,
  users,
  onAddBooking,
  onUpdateBookingStatus
}: BookingsProps) {
  const isTherapist = user.role === 'THERAPIST';
  // SALON_MANAGER accounts are now auto-surfaced as assignable therapists
  // (see branchTherapists below, mirroring POS.tsx) - so a manager can have
  // their own bookings just like a real therapist, on top of needing the
  // full cross-branch agenda for their oversight role. Give them a toggle
  // to switch between the two instead of only ever seeing everyone's
  // bookings with no way to isolate their own schedule.
  const isManager = user.role === 'SALON_MANAGER';
  const [showMineOnly, setShowMineOnly] = useState(false);

  // A manager's "own" therapist identity: if they already have a real,
  // linked Therapist record (dual-role staff who also perform services),
  // that record's id is what bookings reference. Otherwise it's the
  // synthetic id used for them everywhere else in this file (== their
  // user id - see branchTherapists below).
  const myTherapistId = useMemo(() => {
    if (!isManager) return null;
    const linked = therapists.find(t => t.linkedUserId === user.id);
    return linked ? linked.id : user.id;
  }, [isManager, therapists, user.id]);

  // State for Booking Creator Drawer
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [bookingBranch, setBookingBranch] = useState<'NAO_STUDIO' | 'DIAEL_BEAUTY'>(
    user.branch === 'ALL' ? 'NAO_STUDIO' : user.branch as 'NAO_STUDIO' | 'DIAEL_BEAUTY'
  );

  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || '');
  const [selectedTreatmentId, setSelectedTreatmentId] = useState('');
  const [selectedTherapistId, setSelectedTherapistId] = useState('');
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookingTime, setBookingTime] = useState('12:00');
  const [bookingDuration, setBookingDuration] = useState<number | ''>('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  // Filtering list triggers
  const activeBranchFilter = isTherapist ? user.branch : (user.role === 'SALON_MANAGER' ? user.branch : selectedBranch);

  const filteredBookings = useMemo(() => {
    let list = bookings;
    if (isTherapist) {
      // Find logged in therapist profile
      const prof = therapists.find(t => t.name.toLowerCase() === user.name.toLowerCase());
      if (prof) list = list.filter(b => b.therapistId === prof.id);
    } else if (activeBranchFilter !== 'ALL') {
      list = list.filter(b => b.branch === activeBranchFilter);
    }
    if (isManager && showMineOnly && myTherapistId) {
      list = list.filter(b => b.therapistId === myTherapistId);
    }
    return list.sort((a, b) => (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time));
  }, [bookings, isTherapist, activeBranchFilter, therapists, user.name, isManager, showMineOnly, myTherapistId]);

  // Dynamic values based on selected booking branch in form
  const branchTreatments = useMemo(() => {
    return TREATMENT_OPTIONS.filter(t => t.branches.includes(bookingBranch));
  }, [bookingBranch]);

  // Same structural fix as POS.tsx's activeTherapists: previously this only
  // read the `therapists` collection, so a SALON_MANAGER never showed up as
  // an assignable therapist here (e.g. at DIAEL Beauty) unless someone
  // manually created a duplicate Therapist record for them via linkedUserId.
  // Every manager in the same branch is now surfaced automatically. A
  // manager who already has a linked real Therapist record (dual-role staff
  // who also perform services) keeps using that record - the synthetic one
  // is skipped for them to avoid listing the same person twice. Managers are
  // tagged with all three treatment specialties (Nail/Eyelash/Eyebrow) since
  // they can be assigned to any booking type, not just one.
  const branchTherapists = useMemo(() => {
    const realTherapists = therapists.filter(t => t.branch === bookingBranch);

    const alreadyLinkedManagerIds = new Set(
      therapists.filter(t => t.linkedUserId).map(t => t.linkedUserId as string)
    );

    const managerTherapists: Therapist[] = users
      .filter(u =>
        u.role === 'SALON_MANAGER' &&
        (u.branch === bookingBranch || u.branch === 'ALL') &&
        !alreadyLinkedManagerIds.has(u.id)
      )
      .map(u => ({
        id: u.id,
        name: `${u.name} (Manager)`,
        branch: bookingBranch,
        specialties: ['Nail', 'Eyelash', 'Eyebrow'],
        rating: 0,
        commissionRate: u.commissionRate || 0,
        totalCommissionEarned: 0,
        status: 'active',
        monthlyTarget: u.monthlyTarget || 0,
        currentSales: 0,
        baseSalary: u.baseSalary || 0,
      }));

    return [...realTherapists, ...managerTherapists];
  }, [therapists, users, bookingBranch]);

  // Customers are branch-specific (separate NAO Studio / DIAEL Beauty client
  // bases) - only show the ones whose preferredBranch matches the branch
  // selected in this form.
  const branchCustomers = useMemo(() => {
    return customers.filter(c => c.preferredBranch === bookingBranch);
  }, [customers, bookingBranch]);

  // Set default selects when the branch swaps (or the list first loads) -
  // but NOT on every background re-poll. `branchTherapists`/`branchTreatments`
  // get a brand new array reference every ~4s because App.tsx's onSnapshot
  // poller re-fetches `therapists` on an interval even when nothing
  // changed. This used to be a `useMemo` that unconditionally called
  // setSelectedTherapistId(branchTherapists[0].id) whenever that reference
  // changed - so picking "Gizel" in the dropdown got silently stomped back
  // to whichever therapist happens to be first in the list (e.g. "Caca")
  // within a few seconds, before the person even finished filling the
  // form. Guarding on "is the current selection still valid" means a
  // real, still-present selection is left alone; only a selection that's
  // actually gone (branch swapped, or nothing picked yet) gets defaulted.
  useEffect(() => {
    if (branchTreatments.length > 0 && !branchTreatments.some(t => t.id === selectedTreatmentId)) {
      setSelectedTreatmentId(branchTreatments[0].id);
    }
    if (branchTherapists.length > 0 && !branchTherapists.some(t => t.id === selectedTherapistId)) {
      setSelectedTherapistId(branchTherapists[0].id);
    }
    if (!branchCustomers.some(c => c.id === selectedCustomerId)) {
      setSelectedCustomerId(branchCustomers[0]?.id || '');
    }
  }, [branchTreatments, branchTherapists, branchCustomers]);

  // Find the selected treatment and therapist
  const selectedTreatment = useMemo(() => {
    return TREATMENT_OPTIONS.find(t => t.id === selectedTreatmentId);
  }, [selectedTreatmentId]);

  const selectedTherapist = useMemo(() => {
    return branchTherapists.find(t => t.id === selectedTherapistId);
  }, [branchTherapists, selectedTherapistId]);

  // Compute occupied slots for selected therapist + date
  const occupiedSlots = useMemo(() => {
    if (!selectedTherapistId || !bookingDate) return [];
    return bookings
      .filter(b => b.therapistId === selectedTherapistId && b.date === bookingDate && b.status !== 'cancelled')
      .map(b => {
        const startMin = timeToMinutes(b.time);
        const endMin = startMin + b.duration;
        return {
          id: b.id,
          time: b.time,
          endTime: minutesToTime(endMin),
          serviceName: b.serviceName,
          status: b.status
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [bookings, selectedTherapistId, bookingDate]);

  // Compute overlap conflict and auto-suggestions
  const { conflictError, availableSuggestions } = useMemo(() => {
    const duration = Number(bookingDuration);
    if (!selectedTherapistId || !selectedTreatmentId || !bookingDate || !bookingTime || !selectedTreatment || !selectedTherapist || !duration || duration <= 0) {
      return { conflictError: '', availableSuggestions: [] };
    }

    const currentSlot = { date: bookingDate, time: bookingTime, duration };

    // Check if therapist overlaps on same branch, date, with pending/checked_in statuses
    const conflictingBooking = bookings.find(b => 
      b.therapistId === selectedTherapistId &&
      b.date === bookingDate &&
      b.branch === bookingBranch &&
      (b.status === 'pending' || b.status === 'checked_in') &&
      isBookingOverlap(currentSlot, b)
    );

    let conflictError = '';
    let availableSuggestions: Therapist[] = [];

    if (conflictingBooking) {
      const conflictStart = timeToMinutes(conflictingBooking.time);
      const conflictEnd = conflictStart + conflictingBooking.duration;
      const endStr = minutesToTime(conflictEnd);
      conflictError = `Terapis ${conflictingBooking.therapistName} sudah memiliki jadwal jam ${conflictingBooking.time} - ${endStr} pada tanggal ini. Pilih terapis lain atau jam lain.`;

      // Suggest other therapists in same branch who do not have overlap in this slot
      availableSuggestions = branchTherapists.filter(t => {
        if (t.id === selectedTherapistId) return false;
        const hasConflict = bookings.some(b => 
          b.therapistId === t.id &&
          b.date === bookingDate &&
          b.branch === bookingBranch &&
          (b.status === 'pending' || b.status === 'checked_in') &&
          isBookingOverlap(currentSlot, b)
        );
        return !hasConflict;
      });
    }

    return { conflictError, availableSuggestions };
  }, [bookings, selectedTherapistId, selectedTherapist, selectedTreatmentId, selectedTreatment, bookingDate, bookingTime, bookingDuration, branchTherapists, bookingBranch]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (conflictError) {
      return;
    }
    const customer = customers.find(c => c.id === selectedCustomerId) || branchCustomers[0];
    const treatment = TREATMENT_OPTIONS.find(t => t.id === selectedTreatmentId);
    const therapist = branchTherapists.find(t => t.id === selectedTherapistId);
    const duration = Number(bookingDuration);

    if (!customer || !treatment || !therapist) return;

    if (!Number.isFinite(duration) || duration <= 0) {
      setGeneralError('Masukkan durasi treatment (dalam menit) sebelum menjadwalkan appointment.');
      return;
    }

    setGeneralError('');
    setIsSubmittingBooking(true);
    try {
      await onAddBooking({
        customerName: customer.name,
        customerPhone: customer.phone,
        serviceId: treatment.id,
        serviceName: treatment.name,
        therapistId: therapist.id,
        therapistName: therapist.name,
        branch: bookingBranch,
        date: bookingDate,
        time: bookingTime,
        duration,
        price: 0,
        status: 'pending',
        notes: bookingNotes
      });

      // Reset Form - only on confirmed success, so a failed save leaves the
      // drawer open with the person's input intact instead of silently
      // discarding it.
      setBookingDuration('');
      setBookingNotes('');
      setShowAddBooking(false);
    } catch (err: any) {
      setGeneralError(err?.message || 'Gagal menyimpan booking. Silakan coba lagi.');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  return (
    <div id="bookings-module" className="grid grid-cols-1 xl:grid-cols-12 gap-6">
      
      {/* Bookings Schedule Calendar lists */}
      <div className="xl:col-span-8 bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
              {isTherapist || (isManager && showMineOnly) ? 'My Appointments Sheet' : 'Cross-Branch Bookings Agenda'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Track Checked-In statuses, therapist occupancy, and upcoming guest arrivals.</p>
          </div>

          <div className="flex items-center gap-2 self-start">
            {isManager && (
              <div className="flex items-center bg-slate-100 rounded-xl p-1 text-xs font-bold">
                <button
                  onClick={() => setShowMineOnly(false)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${!showMineOnly ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
                >
                  Semua Booking
                </button>
                <button
                  onClick={() => setShowMineOnly(true)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${showMineOnly ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
                >
                  Booking Saya
                </button>
              </div>
            )}

            {!isTherapist && (
              <button
                onClick={() => setShowAddBooking(true)}
                className="px-4 py-2 bg-[#1a1c1e] hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                <span>Schedule Booking</span>
              </button>
            )}
          </div>
        </div>

        {generalError && (
          <div className="bg-rose-50 border border-rose-150 p-3.5 rounded-2xl flex items-start gap-2.5 text-rose-800 text-xs font-semibold shadow-2xs">
            <ShieldAlert className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p>{generalError}</p>
            </div>
          </div>
        )}

        {/* Schedule List */}
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-mono">No bookings scheduled in this scope.</div>
          ) : (
            filteredBookings.map((b) => (
              <div 
                key={b.id} 
                className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  b.status === 'completed' 
                    ? 'bg-emerald-50/20 border-emerald-100/80' 
                    : b.status === 'cancelled' 
                    ? 'bg-slate-50 border-slate-200 opacity-60' 
                    : b.status === 'checked_in'
                    ? 'bg-amber-50/20 border-amber-200/80 ring-1 ring-amber-400/10'
                    : 'bg-white border-slate-100 hover:shadow-xs'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-[#D4AF37] font-mono">{b.time}</span>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">{b.date.substring(5)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold text-slate-900">{b.customerName}</h4>
                      <span className={`text-[8px] font-mono uppercase font-extrabold px-2 py-0.5 rounded-full ${
                        b.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                        b.status === 'checked_in' ? 'bg-amber-100 text-amber-800 font-bold' :
                        b.status === 'cancelled' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {b.status.replace('_', ' ')}
                      </span>
                      <span className="text-[8px] font-mono px-1 bg-slate-100 text-slate-600 rounded">
                        {b.branch === 'NAO_STUDIO' ? 'NAO' : 'DIAEL'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium mt-1">
                      {b.serviceName} ({formatIDR(b.price)} • {b.duration} mins)
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Therapist: <span className="font-bold text-slate-700">{b.therapistName}</span>
                    </p>
                    {b.notes && <p className="text-[10px] text-slate-400 italic mt-0.5">Note: "{b.notes}"</p>}
                  </div>
                </div>

                {/* Quick actions inside listing */}
                <div className="flex items-center gap-1.5 self-end md:self-center">
                  {b.status === 'pending' && (
                    <button
                      onClick={() => {
                        const targetBooking = b;
                        const hasOverlap = bookings.some(other => 
                          other.id !== targetBooking.id &&
                          other.therapistId === targetBooking.therapistId &&
                          other.branch === targetBooking.branch &&
                          other.date === targetBooking.date &&
                          (other.status === 'pending' || other.status === 'checked_in') &&
                          isBookingOverlap(targetBooking, other)
                        );

                        if (hasOverlap) {
                          const overlapping = bookings.find(other => 
                            other.id !== targetBooking.id &&
                            other.therapistId === targetBooking.therapistId &&
                            other.branch === targetBooking.branch &&
                            other.date === targetBooking.date &&
                            (other.status === 'pending' || other.status === 'checked_in') &&
                            isBookingOverlap(targetBooking, other)
                          );
                          const overlapEndTime = overlapping 
                            ? minutesToTime(timeToMinutes(overlapping.time) + overlapping.duration) 
                            : '';
                          setGeneralError(`Check-In Gagal: Terapis ${targetBooking.therapistName} sudah memiliki jadwal aktif pada jam ${overlapping?.time || ''} - ${overlapEndTime} hari ini.`);
                          setTimeout(() => setGeneralError(''), 7000);
                          return;
                        }

                        setGeneralError('');
                        onUpdateBookingStatus(b.id, 'checked_in');
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg cursor-pointer transition-all shrink-0"
                    >
                      Check In
                    </button>
                  )}
                  {b.status === 'checked_in' && (
                    <button
                      onClick={() => onUpdateBookingStatus(b.id, 'completed')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg cursor-pointer transition-all shrink-0"
                    >
                      Complete
                    </button>
                  )}
                  {b.status !== 'completed' && b.status !== 'cancelled' && (
                    <button
                      onClick={() => onUpdateBookingStatus(b.id, 'cancelled')}
                      className="px-2.5 py-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 text-[10px] font-bold rounded-lg cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  )}
                  {b.status === 'completed' && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Session Done
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Booking Creator Drawer Form */}
      <div className="xl:col-span-4">
        {showAddBooking && !isTherapist ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">Create Appointment</h3>
              <button 
                onClick={() => setShowAddBooking(false)}
                className="text-xs text-rose-500 font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleBookingSubmit} className="space-y-3">
              {user.role === 'HKA_MANAGEMENT' ? (
                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">TARGET SALON</label>
                  <select
                    value={bookingBranch}
                    onChange={(e: any) => setBookingBranch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 focus:outline-none"
                  >
                    <option value="NAO_STUDIO">NAO Studio (Hair & Nails)</option>
                    <option value="DIAEL_BEAUTY">DIAEL Beauty (Lashes & Spa)</option>
                  </select>
                </div>
              ) : (
                <div className="text-xs font-semibold text-slate-500 bg-slate-50 p-2 rounded-xl">
                  Salon Branch: <span className="text-slate-800 font-bold">{user.branch === 'NAO_STUDIO' ? 'NAO Studio' : 'DIAEL Beauty'}</span>
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">SELECT CUSTOMER</label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 focus:outline-none"
                >
                  {branchCustomers.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">CHOOSE TREATMENT</label>
                <select
                  value={selectedTreatmentId}
                  onChange={(e) => setSelectedTreatmentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 focus:outline-none"
                >
                  {branchTreatments.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">ASSIGN THERAPIST</label>
                <select
                  value={selectedTherapistId}
                  onChange={(e) => setSelectedTherapistId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-700 focus:outline-none"
                >
                  {branchTherapists.map(t => (
                    <option key={t.id} value={t.id}>{t.name} (★ {t.rating})</option>
                  ))}
                </select>

                {selectedTherapistId && (
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 mt-1.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider">Jadwal Terapis • {bookingDate}</span>
                      <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${
                        occupiedSlots.length === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {occupiedSlots.length === 0 ? 'Tersedia' : `${occupiedSlots.length} Booked`}
                      </span>
                    </div>
                    {occupiedSlots.length === 0 ? (
                      <p className="text-[10px] text-slate-500 italic">Fully available today.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {occupiedSlots.map(slot => (
                          <div key={slot.id} className="text-[9px] px-2 py-1 bg-white border border-slate-200 rounded-lg flex flex-col font-mono shadow-3xs max-w-[120px]">
                            <span className="font-bold text-slate-700">{slot.time} - {slot.endTime}</span>
                            <span className="text-slate-400 truncate text-[8px]">{slot.serviceName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">DATE</label>
                  <input
                    type="date"
                    required
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-2.5 py-2 text-slate-800 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-mono block mb-1">TIME</label>
                  <input
                    type="time"
                    required
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-2.5 py-2 text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">DURATION (MENIT)</label>
                <input
                  type="number"
                  required
                  min={1}
                  step={5}
                  placeholder="e.g. 60"
                  value={bookingDuration}
                  onChange={(e) => setBookingDuration(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-2.5 py-2 text-slate-800 focus:outline-none"
                />
                <p className="text-[9px] text-slate-400 mt-1">Isi manual sesuai treatment, lalu sesuaikan terapis yang tersedia di jam tersebut.</p>
              </div>

              {conflictError && (
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-2xl space-y-2">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] font-semibold text-rose-800 leading-relaxed">
                      {conflictError}
                    </p>
                  </div>
                  {availableSuggestions.length > 0 && (
                    <div className="pt-2 border-t border-rose-200/50">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono mb-1.5">
                        Terapis lain di cabang yang sama (Tersedia):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {availableSuggestions.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedTherapistId(t.id)}
                            className="text-[10px] bg-white border border-rose-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 text-slate-700 font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-3xs flex items-center gap-1"
                          >
                            <span className="text-[#D4AF37]">★</span>
                            <span>{t.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[10px] text-slate-400 font-mono block mb-1">BOOKING INSTRUCTIONS / NOTES</label>
                <input
                  type="text"
                  placeholder="e.g. Skin test required beforehand"
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl text-xs px-3 py-2 text-slate-800 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingBooking}
                className="w-full bg-[#1a1c1e] hover:bg-slate-800 text-white font-bold text-xs py-3 rounded-xl cursor-pointer mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingBooking ? 'Menyimpan...' : 'Schedule Appointment'}
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-[#1a1c1e] text-white rounded-3xl p-6 shadow-md text-center space-y-4">
            <Calendar className="w-10 h-10 text-[#D4AF37] mx-auto" />
            <div>
              <h3 className="font-serif text-[#D4AF37] text-base font-bold">CROSS-SALON CALENDAR</h3>
              <p className="text-xs text-slate-400 mt-1">Cross-branch bookings synchronized in real-time. Prevents therapist overbooking and double slots.</p>
            </div>
            {!isTherapist && (
              <button
                onClick={() => setShowAddBooking(true)}
                className="w-full bg-[#D4AF37] text-[#1a1c1e] font-bold text-xs py-2 rounded-xl hover:bg-amber-400 cursor-pointer transition-all font-sans"
              >
                Schedule Booking
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
