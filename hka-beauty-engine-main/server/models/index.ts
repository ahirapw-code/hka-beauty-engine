import Customer from "./Customer";
import Therapist from "./Therapist";
import Product from "./Product";
import Service from "./Service";
import Transaction from "./Transaction";
import Attendance from "./Attendance";
import User from "./User";
import PayrollAuditLog from "./PayrollAuditLog";
import Booking from "./Booking";
import Expense from "./Expense";
import Payroll from "./Payroll";
import Setting from "./Setting";
import Upload from "./Upload";

export {
  Customer,
  Therapist,
  Product,
  Service,
  Transaction,
  Attendance,
  User,
  PayrollAuditLog,
  Booking,
  Expense,
  Payroll,
  Setting,
  Upload,
};

/**
 * Maps the public REST collection name (as used by the frontend, matching
 * the old Firestore collection names) to its Mongoose model.
 * This is what allows the generic /api/data/:collection routes to work
 * as a drop-in replacement for Firestore's collection()/doc() API.
 */
export const collectionRegistry: Record<string, any> = {
  customers: Customer,
  therapists: Therapist,
  products: Product,
  services: Service,
  transactions: Transaction,
  attendance: Attendance,
  users: User,
  bookings: Booking,
  expenses: Expense,
  payroll: Payroll,
  settings: Setting,
};
