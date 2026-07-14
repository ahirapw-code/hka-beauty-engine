import Customer from "./Customer.js";
import Therapist from "./Therapist.js";
import Product from "./Product.js";
import Service from "./Service.js";
import Transaction from "./Transaction.js";
import Attendance from "./Attendance.js";
import User from "./User.js";
import PayrollAuditLog from "./PayrollAuditLog.js";
import Booking from "./Booking.js";
import Expense from "./Expense.js";
import Payroll from "./Payroll.js";
import Setting from "./Setting.js";
import Upload from "./Upload.js";

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
