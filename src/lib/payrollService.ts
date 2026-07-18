import { collection, doc, getDoc, getDocs, query, where } from './firestoreClient';
import { db } from './firebase';
import { Therapist, Transaction } from '../types';

/**
 * Turns a "YYYY-MM" period into a [startDate, endDate) pair of "YYYY-MM-DD"
 * strings suitable for a lexicographic range query, since `date` is stored
 * as an ISO-ish string rather than a real Date/timestamp field.
 */
function periodMonthRange(periodMonth: string): { startDate: string; endDate: string } {
  const [yearStr, monthStr] = periodMonth.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);
  month++;
  if (month > 12) {
    month = 1;
    year++;
  }
  const nextMonthStr = `${year}-${String(month).padStart(2, '0')}`;
  return { startDate: `${periodMonth}-01`, endDate: `${nextMonthStr}-01` };
}

export async function calculateStaffAttendance(userId: string, periodMonth: string): Promise<number> {
  try {
    const { startDate, endDate } = periodMonthRange(periodMonth);
    const attendanceRef = collection(db, 'attendance');
    // Filter by the month's date range server-side (was previously
    // fetching this user's *entire* attendance history and filtering by
    // month in the browser) - this is the fix for both the unnecessary
    // full-history read and the slow N-therapist payroll load, since this
    // function gets called once per staff member.
    const q = query(
      attendanceRef,
      where('userId', '==', userId),
      where('status', '==', 'completed'),
      where('date', '>=', startDate),
      where('date', '<', endDate)
    );
    const snap = await getDocs(q);
    return snap.docs.length;
  } catch (error) {
    console.error('Error calculating staff attendance:', error);
    return 0;
  }
}

export async function calculateTherapistPayrollForPeriod(
  therapistId: string,
  periodMonth: string,
  // Branch the therapist belongs to. Optional for backward compatibility,
  // but strongly recommended: without it, this scans every branch's
  // transactions for the month instead of just the relevant one.
  branch?: 'NAO_STUDIO' | 'DIAEL_BEAUTY'
): Promise<{
  baseSalary: number;
  commissionEarned: number;
  daysPresent: number;
}> {
  try {
    // 1. Get therapist document
    const therapistDocRef = doc(db, 'therapists', therapistId);
    const therapistSnap = await getDoc(therapistDocRef);
    if (!therapistSnap.exists()) {
      throw new Error(`Therapist with ID ${therapistId} not found`);
    }
    const therapistData = therapistSnap.data() as Therapist;
    // `baseSalary` on the Therapist record is a per-day rate (set per
    // therapist via the Therapists Google Sheet tab), not a flat monthly
    // amount - so the actual base pay for the period must scale with how
    // many days the therapist actually worked, computed further down once
    // daysPresent is known.
    const dailyRate = therapistData.baseSalary || 0;
    const commissionRate = therapistData.commissionRate || 0;

    // 2. Fetch transactions for the month, filtered server-side by both
    // date range AND branch (previously only date - so this pulled every
    // branch's transactions for the whole month for every single
    // therapist, most of which were immediately discarded).
    const { startDate, endDate } = periodMonthRange(periodMonth);
    const effectiveBranch = branch || therapistData.branch;

    const transactionsRef = collection(db, 'transactions');
    const txQuery = effectiveBranch
      ? query(
          transactionsRef,
          where('branch', '==', effectiveBranch),
          where('date', '>=', startDate),
          where('date', '<', endDate)
        )
      : query(transactionsRef, where('date', '>=', startDate), where('date', '<', endDate));

    const transactionsSnap = await getDocs(txQuery);
    let commissionEarned = 0;
    transactionsSnap.forEach(docSnap => {
      const tx = docSnap.data() as Transaction;
      tx.items.forEach(item => {
        if (item.therapistId === therapistId) {
          commissionEarned += item.price * item.quantity * commissionRate;
        }
      });
    });

    // 3. Fetch attendance - a dual-role manager clocks in under their own
    // User account (linkedUserId), not this Therapist record's id, so use
    // that when present. Ordinary therapists keep using therapistId as before.
    const daysPresent = await calculateStaffAttendance(therapistData.linkedUserId || therapistId, periodMonth);

    // Base pay = this therapist's own daily rate x days actually worked,
    // so two therapists with different daily rates (or different
    // attendance) end up with correctly different base pay instead of
    // everyone getting the same flat amount regardless of days worked.
    const baseSalary = Math.round(dailyRate * daysPresent);

    return {
      baseSalary,
      commissionEarned: Math.round(commissionEarned),
      daysPresent
    };
  } catch (error) {
    console.error('Error calculating therapist payroll:', error);
    return {
      baseSalary: 0,
      commissionEarned: 0,
      daysPresent: 0
    };
  }
}
