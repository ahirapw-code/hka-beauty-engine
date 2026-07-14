import { collection, doc, getDoc, getDocs, query, where } from './firestoreClient';
import { db } from './firebase';
import { Therapist, Transaction } from '../types';

export async function calculateStaffAttendance(userId: string, periodMonth: string): Promise<number> {
  try {
    const attendanceRef = collection(db, 'attendance');
    const q = query(
      attendanceRef,
      where('userId', '==', userId),
      where('status', '==', 'completed')
    );
    const snap = await getDocs(q);
    let daysPresent = 0;
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.date && data.date.startsWith(periodMonth)) {
        daysPresent++;
      }
    });
    return daysPresent;
  } catch (error) {
    console.error('Error calculating staff attendance:', error);
    return 0;
  }
}

export async function calculateTherapistPayrollForPeriod(
  therapistId: string,
  periodMonth: string
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
    const baseSalary = therapistData.baseSalary || 0;
    const commissionRate = therapistData.commissionRate || 0;

    // 2. Fetch transactions for the month with range query
    const [yearStr, monthStr] = periodMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    const nextMonthStr = `${year}-${String(month).padStart(2, '0')}`;
    const startDate = `${periodMonth}-01`;
    const endDate = `${nextMonthStr}-01`;

    const transactionsRef = collection(db, 'transactions');
    const txQuery = query(
      transactionsRef,
      where('date', '>=', startDate),
      where('date', '<', endDate)
    );
    const transactionsSnap = await getDocs(txQuery);
    let commissionEarned = 0;
    transactionsSnap.forEach(docSnap => {
      const tx = docSnap.data() as Transaction;
      if (tx.date && tx.date.startsWith(periodMonth)) {
        tx.items.forEach(item => {
          if (item.therapistId === therapistId) {
            commissionEarned += item.price * item.quantity * commissionRate;
          }
        });
      }
    });

    // 3. Fetch attendance
    const daysPresent = await calculateStaffAttendance(therapistId, periodMonth);

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
