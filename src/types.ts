export type Role = 'HKA_MANAGEMENT' | 'SALON_MANAGER' | 'THERAPIST';
export type Branch = 'NAO_STUDIO' | 'DIAEL_BEAUTY' | 'ALL';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  branch: Branch;
  email: string;
  avatar?: string;
  forcePasswordChange?: boolean;
  // Payroll rate fields for SALON_MANAGER accounts - set via the
  // "Managers" Google Sheets payroll sync, same mechanism as Therapist
  // commissionRate/baseSalary. Not meaningful for other roles.
  commissionRate?: number;
  baseSalary?: number;
  // Sales target for SALON_MANAGER accounts - same "Managers" sheet/sync
  // mechanism as above, mirrors Therapist.monthlyTarget.
  monthlyTarget?: number;
}

export interface Therapist {
  id: string;
  name: string;
  branch: Exclude<Branch, 'ALL'>;
  specialties: string[];
  rating: number;
  commissionRate: number; // e.g. 0.15 for 15%
  totalCommissionEarned: number;
  status: 'active' | 'inactive';
  monthlyTarget: number; // Target sales to meet, e.g., 5000
  currentSales: number;  // Current total sales completed by therapist
  baseSalary: number; // Base salary for therapist
  // Dual-role staff: set to a User.id when this Therapist record is the
  // "therapist hat" of a Salon Manager who also performs services
  // themselves. Empty/undefined for ordinary single-role therapists.
  linkedUserId?: string;
}

export interface Service {
  id: string;
  name: string;
  category: 'Hair' | 'Nails' | 'Lashes' | 'Skincare' | 'Massage';
  price: number;
  duration: number; // in minutes
  branches: Exclude<Branch, 'ALL'>[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  branch: Exclude<Branch, 'ALL'>;
  category: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalSpend: number;
  visitsCount: number;
  lastVisit?: string;
  notes?: string;
  preferredBranch: Exclude<Branch, 'ALL'>;
  // Membership marker - once true, customer auto-gets a 5% discount at
  // checkout. Tier (Basic/Silver/Gold/Platinum) is NOT stored here, it's
  // derived from visitsCount - see getMembershipTier() in utils.ts.
  isMember?: boolean;
  memberSince?: string; // YYYY-MM-DD
}

export interface Booking {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  therapistId: string;
  therapistName: string;
  branch: Exclude<Branch, 'ALL'>;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration: number;
  price: number;
  status: 'pending' | 'checked_in' | 'completed' | 'cancelled';
  notes?: string;
}

export interface Transaction {
  id: string;
  customerName: string;
  customerId?: string;
  branch: Exclude<Branch, 'ALL'>;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    type: 'service' | 'product';
    therapistId?: string;
    discountValue?: number;
    discountType?: 'percent' | 'flat';
  }>;
  subtotal: number;
  discount: number;
  // Portion of `discount` that came from the automatic membership discount,
  // kept separately for receipt display/reporting purposes.
  membershipDiscount?: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'e_wallet';
  date: string; // YYYY-MM-DDTHH:MM:SS
  cashierName: string;
}

export interface Expense {
  id: string;
  branch: Exclude<Branch, 'ALL'>;
  category: 'Rent' | 'Utilities' | 'Supplies' | 'Marketing' | 'Salaries' | 'Other';
  amount: number;
  date: string;
  description: string;
}

export interface Attendance {
  id: string;
  userId: string;
  userName: string;
  role: Role;
  branch: Exclude<Branch, 'ALL'>;
  date: string; // YYYY-MM-DD
  clockIn: string; // HH:MM:SS
  clockOut?: string; // HH:MM:SS
  status: 'active' | 'completed';
  notes?: string;
}

export interface BranchProfile {
  branch: Exclude<Branch, 'ALL'>;
  displayName: string;
  logoUrl?: string;
  address: string;
  phone: string;
  invoiceFooterNote: string;
  bankInfo: string;
}

export interface Payroll {
  id: string;
  staffId: string;
  staffName: string;
  staffType: 'therapist' | 'manager';
  branch: Exclude<Branch, 'ALL'>;
  periodMonth: string; // YYYY-MM
  baseSalary: number;
  commissionEarned: number;
  daysPresent: number;
  bonus: number;
  deductions: number;
  netPay: number;
  status: 'draft' | 'finalized' | 'paid';
  generatedAt: string;
  generatedBy: string;
}
