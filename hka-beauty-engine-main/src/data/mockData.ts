import { User, Therapist, Service, Product, Customer, Booking, Transaction, Expense, Attendance } from '../types';

export const PRESET_USERS: User[] = [
  {
    id: 'u1',
    username: 'hka_admin',
    name: 'Hana Al-Khalifa',
    role: 'HKA_MANAGEMENT',
    branch: 'ALL',
    email: 'hana@hka-management.com',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150'
  },
  {
    id: 'u2',
    username: 'nao_manager',
    name: 'Sarah Jenkins',
    role: 'SALON_MANAGER',
    branch: 'NAO_STUDIO',
    email: 'sarah.j@naostudio.com',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150'
  },
  {
    id: 'u3',
    username: 'diael_manager',
    name: 'Elena Rostova',
    role: 'SALON_MANAGER',
    branch: 'DIAEL_BEAUTY',
    email: 'elena.r@diaelbeauty.com',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150'
  },
  {
    id: 'u4',
    username: 'therapist_lisa',
    name: 'Lisa Wong',
    role: 'THERAPIST',
    branch: 'NAO_STUDIO',
    email: 'lisa.w@naostudio.com',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
  },
  {
    id: 'u5',
    username: 'therapist_anna',
    name: 'Anna Smith',
    role: 'THERAPIST',
    branch: 'DIAEL_BEAUTY',
    email: 'anna.s@diaelbeauty.com',
    avatar: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150'
  }
];

const RAW_THERAPISTS: Therapist[] = [
  {
    id: 't1',
    name: 'Lisa Wong',
    branch: 'NAO_STUDIO',
    specialties: ['Balayage Hair Styling', 'Signature Hair Coloring', 'Hair Botox Treatment'],
    rating: 4.9,
    commissionRate: 0.15,
    totalCommissionEarned: 1420,
    status: 'active',
    monthlyTarget: 8000,
    currentSales: 6400,
    baseSalary: 3000000
  },
  {
    id: 't2',
    name: 'Rachel Chen',
    branch: 'NAO_STUDIO',
    specialties: ['Gel Nail Extensions', 'Russian Manicure', 'Aesthetic Pedicure'],
    rating: 4.8,
    commissionRate: 0.12,
    totalCommissionEarned: 950,
    status: 'active',
    monthlyTarget: 6000,
    currentSales: 4200,
    baseSalary: 2500000
  },
  {
    id: 't3',
    name: 'Anna Smith',
    branch: 'DIAEL_BEAUTY',
    specialties: ['Premium Lash Extension', 'Lash Lift & Tint', 'Eyebrow Lamination'],
    rating: 4.9,
    commissionRate: 0.15,
    totalCommissionEarned: 1180,
    status: 'active',
    monthlyTarget: 7000,
    currentSales: 5100,
    baseSalary: 3200000
  },
  {
    id: 't4',
    name: 'Maria Lopez',
    branch: 'DIAEL_BEAUTY',
    specialties: ['Hydrafacial Deluxe', 'Anti-Aging Facial Therapy', 'Aromatherapy Massage'],
    rating: 4.7,
    commissionRate: 0.18,
    totalCommissionEarned: 1850,
    status: 'active',
    monthlyTarget: 9000,
    currentSales: 8500,
    baseSalary: 3500000
  },
  {
    id: 't5',
    name: 'Chloe Dubois',
    branch: 'DIAEL_BEAUTY',
    specialties: ['Swedish Massage', 'Volcano Hot Stone', 'Reflexology Therapy'],
    rating: 4.6,
    commissionRate: 0.15,
    totalCommissionEarned: 760,
    status: 'active',
    monthlyTarget: 5000,
    currentSales: 2900,
    baseSalary: 2800000
  }
];

const RAW_SERVICES: Service[] = [
  // NAO Studio Services
  {
    id: 's1',
    name: 'Balayage Premium Styling',
    category: 'Hair',
    price: 180,
    duration: 150,
    branches: ['NAO_STUDIO']
  },
  {
    id: 's2',
    name: 'Signature Hair Coloring',
    category: 'Hair',
    price: 120,
    duration: 90,
    branches: ['NAO_STUDIO']
  },
  {
    id: 's3',
    name: 'Hair Botox Restoration',
    category: 'Hair',
    price: 150,
    duration: 120,
    branches: ['NAO_STUDIO']
  },
  {
    id: 's4',
    name: 'Russian Hard Gel Manicure',
    category: 'Nails',
    price: 75,
    duration: 60,
    branches: ['NAO_STUDIO', 'DIAEL_BEAUTY']
  },
  {
    id: 's5',
    name: 'Aesthetic Gel Pedicure',
    category: 'Nails',
    price: 60,
    duration: 45,
    branches: ['NAO_STUDIO']
  },

  // DIAEL Beauty Services
  {
    id: 's6',
    name: 'Premium Silk Lash Extensions',
    category: 'Lashes',
    price: 110,
    duration: 90,
    branches: ['DIAEL_BEAUTY']
  },
  {
    id: 's7',
    name: 'Keratin Lash Lift & Tint',
    category: 'Lashes',
    price: 85,
    duration: 60,
    branches: ['DIAEL_BEAUTY', 'NAO_STUDIO']
  },
  {
    id: 's8',
    name: 'Hydrafacial Deluxe Therapy',
    category: 'Skincare',
    price: 140,
    duration: 75,
    branches: ['DIAEL_BEAUTY']
  },
  {
    id: 's9',
    name: 'Anti-Aging LED Facial',
    category: 'Skincare',
    price: 95,
    duration: 60,
    branches: ['DIAEL_BEAUTY']
  },
  {
    id: 's10',
    name: 'Aromatherapy Relaxing Massage',
    category: 'Massage',
    price: 130,
    duration: 90,
    branches: ['DIAEL_BEAUTY']
  },
  {
    id: 's11',
    name: 'Volcano Hot Stone Spa',
    category: 'Massage',
    price: 160,
    duration: 100,
    branches: ['DIAEL_BEAUTY']
  }
];

const RAW_PRODUCTS: Product[] = [
  // NAO Studio Products
  {
    id: 'p1',
    name: 'Olaplex No.3 Hair Perfector',
    sku: 'OLX-N3-001',
    price: 38,
    cost: 18,
    stock: 25,
    minStock: 5,
    branch: 'NAO_STUDIO',
    category: 'Hair Care'
  },
  {
    id: 'p2',
    name: 'Moroccanoil Treatment 100ml',
    sku: 'MOR-TRT-002',
    price: 48,
    cost: 22,
    stock: 18,
    minStock: 4,
    branch: 'NAO_STUDIO',
    category: 'Hair Styling'
  },
  {
    id: 'p3',
    name: 'Organic Almond Cuticle Oil',
    sku: 'ORG-OIL-003',
    price: 15,
    cost: 6,
    stock: 40,
    minStock: 10,
    branch: 'NAO_STUDIO',
    category: 'Nail Care'
  },

  // DIAEL Beauty Products
  {
    id: 'p4',
    name: 'Premium Lash Foam Cleanser',
    sku: 'LSH-FMC-004',
    price: 24,
    cost: 9,
    stock: 30,
    minStock: 8,
    branch: 'DIAEL_BEAUTY',
    category: 'Lash Care'
  },
  {
    id: 'p5',
    name: 'Hydrating Hyaluronic Acid Serum',
    sku: 'SKN-HAS-005',
    price: 55,
    cost: 24,
    stock: 12,
    minStock: 5,
    branch: 'DIAEL_BEAUTY',
    category: 'Skincare'
  },
  {
    id: 'p6',
    name: 'Calming Chamomile Body Massage Oil',
    sku: 'BOD-CHM-006',
    price: 42,
    cost: 16,
    stock: 3, // Low Stock Alert
    minStock: 5,
    branch: 'DIAEL_BEAUTY',
    category: 'Body Spa'
  }
];

const RAW_CUSTOMERS: Customer[] = [
  {
    id: 'c1',
    name: 'Amara Al-Thani',
    email: 'amara.athani@gmail.com',
    phone: '+974 5543 2189',
    totalSpend: 1240,
    visitsCount: 9,
    lastVisit: '2026-07-10',
    preferredBranch: 'NAO_STUDIO',
    notes: 'Prefers mild lavender scent for nails, only books with Lisa or Rachel.'
  },
  {
    id: 'c2',
    name: 'Reem Al-Mansoori',
    email: 'reem.mans@outlook.com',
    phone: '+974 6612 9043',
    totalSpend: 820,
    visitsCount: 5,
    lastVisit: '2026-07-11',
    preferredBranch: 'DIAEL_BEAUTY',
    notes: 'Regular Lash Extensions. Eyes are highly sensitive to strong adhesives.'
  },
  {
    id: 'c3',
    name: 'Sofia Rodriguez',
    email: 'sofia.rod@gmail.com',
    phone: '+974 3354 8871',
    totalSpend: 450,
    visitsCount: 3,
    lastVisit: '2026-07-08',
    preferredBranch: 'NAO_STUDIO',
    notes: 'Prefers Balayage with cool tone blonde highlights.'
  },
  {
    id: 'c4',
    name: 'Fatima Al-Kuwari',
    email: 'fatima.kuwari@yahoo.com',
    phone: '+974 7745 2311',
    totalSpend: 1580,
    visitsCount: 11,
    lastVisit: '2026-07-12',
    preferredBranch: 'DIAEL_BEAUTY',
    notes: 'Loves Hydrafacial and Hot Stone Therapy. Prefers private room.'
  }
];

const RAW_BOOKINGS: Booking[] = [
  // Today's Bookings: 2026-07-12 (Today is Sunday)
  {
    id: 'b1',
    customerName: 'Fatima Al-Kuwari',
    customerPhone: '+974 7745 2311',
    serviceId: 's8',
    serviceName: 'Hydrafacial Deluxe Therapy',
    therapistId: 't4',
    therapistName: 'Maria Lopez',
    branch: 'DIAEL_BEAUTY',
    date: '2026-07-12',
    time: '10:00',
    duration: 75,
    price: 140,
    status: 'completed',
    notes: 'Regular skincare appointment'
  },
  {
    id: 'b2',
    customerName: 'Amara Al-Thani',
    customerPhone: '+974 5543 2189',
    serviceId: 's1',
    serviceName: 'Balayage Premium Styling',
    therapistId: 't1',
    therapistName: 'Lisa Wong',
    branch: 'NAO_STUDIO',
    date: '2026-07-12',
    time: '12:30',
    duration: 150,
    price: 180,
    status: 'checked_in',
    notes: 'Full hair design overhaul'
  },
  {
    id: 'b3',
    customerName: 'Reem Al-Mansoori',
    customerPhone: '+974 6612 9043',
    serviceId: 's6',
    serviceName: 'Premium Silk Lash Extensions',
    therapistId: 't3',
    therapistName: 'Anna Smith',
    branch: 'DIAEL_BEAUTY',
    date: '2026-07-12',
    time: '15:00',
    duration: 90,
    price: 110,
    status: 'pending',
    notes: 'Classic full set'
  },
  {
    id: 'b4',
    customerName: 'Aisha Al-Harami',
    customerPhone: '+974 3341 5562',
    serviceId: 's10',
    serviceName: 'Aromatherapy Relaxing Massage',
    therapistId: 't5',
    therapistName: 'Chloe Dubois',
    branch: 'DIAEL_BEAUTY',
    date: '2026-07-12',
    time: '17:30',
    duration: 90,
    price: 130,
    status: 'pending',
    notes: 'Prefers lavender scent'
  },

  // Future Bookings
  {
    id: 'b5',
    customerName: 'Sofia Rodriguez',
    customerPhone: '+974 3354 8871',
    serviceId: 's4',
    serviceName: 'Russian Hard Gel Manicure',
    therapistId: 't2',
    therapistName: 'Rachel Chen',
    branch: 'NAO_STUDIO',
    date: '2026-07-13',
    time: '11:00',
    duration: 60,
    price: 75,
    status: 'pending'
  },
  {
    id: 'b6',
    customerName: 'Fatima Al-Kuwari',
    customerPhone: '+974 7745 2311',
    serviceId: 's11',
    serviceName: 'Volcano Hot Stone Spa',
    therapistId: 't5',
    therapistName: 'Chloe Dubois',
    branch: 'DIAEL_BEAUTY',
    date: '2026-07-14',
    time: '14:00',
    duration: 100,
    price: 160,
    status: 'pending'
  }
];

const RAW_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx1',
    customerName: 'Amara Al-Thani',
    branch: 'NAO_STUDIO',
    items: [
      { id: 's4', name: 'Russian Hard Gel Manicure', price: 75, quantity: 1, type: 'service', therapistId: 't2' },
      { id: 'p1', name: 'Olaplex No.3 Hair Perfector', price: 38, quantity: 1, type: 'product' }
    ],
    subtotal: 113,
    discount: 13,
    total: 100,
    paymentMethod: 'card',
    date: '2026-07-10T14:22:00',
    cashierName: 'Sarah Jenkins'
  },
  {
    id: 'tx2',
    customerName: 'Reem Al-Mansoori',
    branch: 'DIAEL_BEAUTY',
    items: [
      { id: 's7', name: 'Keratin Lash Lift & Tint', price: 85, quantity: 1, type: 'service', therapistId: 't3' },
      { id: 'p4', name: 'Premium Lash Foam Cleanser', price: 24, quantity: 1, type: 'product' }
    ],
    subtotal: 109,
    discount: 0,
    total: 109,
    paymentMethod: 'bank_transfer',
    date: '2026-07-11T16:45:00',
    cashierName: 'Elena Rostova'
  },
  {
    id: 'tx3',
    customerName: 'Fatima Al-Kuwari',
    branch: 'DIAEL_BEAUTY',
    items: [
      { id: 's8', name: 'Hydrafacial Deluxe Therapy', price: 140, quantity: 1, type: 'service', therapistId: 't4' },
      { id: 'p5', name: 'Hydrating Hyaluronic Acid Serum', price: 55, quantity: 1, type: 'product' }
    ],
    subtotal: 195,
    discount: 15,
    total: 180,
    paymentMethod: 'e_wallet',
    date: '2026-07-12T11:30:00',
    cashierName: 'Elena Rostova'
  },
  // Extra backlogged transactions to build healthy financial charts
  {
    id: 'tx4',
    customerName: 'Dana Al-Naimi',
    branch: 'NAO_STUDIO',
    items: [
      { id: 's1', name: 'Balayage Premium Styling', price: 180, quantity: 1, type: 'service', therapistId: 't1' }
    ],
    subtotal: 180,
    discount: 0,
    total: 180,
    paymentMethod: 'card',
    date: '2026-07-08T12:00:00',
    cashierName: 'Sarah Jenkins'
  },
  {
    id: 'tx5',
    customerName: 'Lulua Al-Thani',
    branch: 'DIAEL_BEAUTY',
    items: [
      { id: 's10', name: 'Aromatherapy Relaxing Massage', price: 130, quantity: 1, type: 'service', therapistId: 't4' }
    ],
    subtotal: 130,
    discount: 10,
    total: 120,
    paymentMethod: 'cash',
    date: '2026-07-09T18:15:00',
    cashierName: 'Elena Rostova'
  },
  // March 2026 Historical Sales
  {
    id: 'tx_h1',
    customerName: 'Aisha Al-Subaey',
    branch: 'NAO_STUDIO',
    items: [{ id: 's1', name: 'Balayage Premium Styling', price: 180, quantity: 2, type: 'service', therapistId: 't1' }],
    subtotal: 360,
    discount: 0,
    total: 3600, // Aggregate transaction representation for scale
    paymentMethod: 'card',
    date: '2026-03-15T14:00:00',
    cashierName: 'Sarah Jenkins'
  },
  {
    id: 'tx_h2',
    customerName: 'Noor Al-Khor',
    branch: 'DIAEL_BEAUTY',
    items: [{ id: 's8', name: 'Hydrafacial Deluxe Therapy', price: 140, quantity: 2, type: 'service', therapistId: 't4' }],
    subtotal: 280,
    discount: 0,
    total: 4100,
    paymentMethod: 'card',
    date: '2026-03-18T16:30:00',
    cashierName: 'Elena Rostova'
  },
  // April 2026 Historical Sales
  {
    id: 'tx_h3',
    customerName: 'Hessa Al-Kuwari',
    branch: 'NAO_STUDIO',
    items: [{ id: 's1', name: 'Balayage Premium Styling', price: 180, quantity: 2, type: 'service', therapistId: 't1' }],
    subtotal: 360,
    discount: 0,
    total: 4200,
    paymentMethod: 'card',
    date: '2026-04-12T11:00:00',
    cashierName: 'Sarah Jenkins'
  },
  {
    id: 'tx_h4',
    customerName: 'Sheikha Al-Thani',
    branch: 'DIAEL_BEAUTY',
    items: [{ id: 's8', name: 'Hydrafacial Deluxe Therapy', price: 140, quantity: 2, type: 'service', therapistId: 't4' }],
    subtotal: 280,
    discount: 0,
    total: 4800,
    paymentMethod: 'card',
    date: '2026-04-20T15:00:00',
    cashierName: 'Elena Rostova'
  },
  // May 2026 Historical Sales
  {
    id: 'tx_h5',
    customerName: 'Mariam Al-Baker',
    branch: 'NAO_STUDIO',
    items: [{ id: 's1', name: 'Balayage Premium Styling', price: 180, quantity: 2, type: 'service', therapistId: 't1' }],
    subtotal: 360,
    discount: 0,
    total: 5100,
    paymentMethod: 'card',
    date: '2026-05-10T12:00:00',
    cashierName: 'Sarah Jenkins'
  },
  {
    id: 'tx_h6',
    customerName: 'Fatma Al-Hajri',
    branch: 'DIAEL_BEAUTY',
    items: [{ id: 's8', name: 'Hydrafacial Deluxe Therapy', price: 140, quantity: 2, type: 'service', therapistId: 't4' }],
    subtotal: 280,
    discount: 0,
    total: 5600,
    paymentMethod: 'card',
    date: '2026-05-25T17:00:00',
    cashierName: 'Elena Rostova'
  },
  // June 2026 Historical Sales
  {
    id: 'tx_h7',
    customerName: 'Reem Al-Marri',
    branch: 'NAO_STUDIO',
    items: [{ id: 's1', name: 'Balayage Premium Styling', price: 180, quantity: 2, type: 'service', therapistId: 't1' }],
    subtotal: 360,
    discount: 0,
    total: 5800,
    paymentMethod: 'card',
    date: '2026-06-08T10:30:00',
    cashierName: 'Sarah Jenkins'
  },
  {
    id: 'tx_h8',
    customerName: 'Alanoud Al-Muftah',
    branch: 'DIAEL_BEAUTY',
    items: [{ id: 's8', name: 'Hydrafacial Deluxe Therapy', price: 140, quantity: 2, type: 'service', therapistId: 't4' }],
    subtotal: 280,
    discount: 0,
    total: 6200,
    paymentMethod: 'card',
    date: '2026-06-19T13:00:00',
    cashierName: 'Elena Rostova'
  }
];

const RAW_EXPENSES: Expense[] = [
  { id: 'e1', branch: 'NAO_STUDIO', category: 'Rent', amount: 3500, date: '2026-07-01', description: 'July Rent' },
  { id: 'e2', branch: 'DIAEL_BEAUTY', category: 'Rent', amount: 4800, date: '2026-07-01', description: 'July Rent & Utility' },
  { id: 'e3', branch: 'NAO_STUDIO', category: 'Supplies', amount: 320, date: '2026-07-05', description: 'Hair Salon developer, foils, cotton pads' },
  { id: 'e4', branch: 'DIAEL_BEAUTY', category: 'Supplies', amount: 450, date: '2026-07-06', description: 'Spa face masks, oils, massage creams' },
  { id: 'e5', branch: 'NAO_STUDIO', category: 'Marketing', amount: 600, date: '2026-07-08', description: 'Instagram ads' }
];

export const INITIAL_THERAPISTS: Therapist[] = RAW_THERAPISTS.map(t => ({
  ...t,
  totalCommissionEarned: t.totalCommissionEarned * 10000,
  monthlyTarget: t.monthlyTarget * 10000,
  currentSales: t.currentSales * 10000
}));

export const INITIAL_SERVICES: Service[] = RAW_SERVICES.map(s => ({
  ...s,
  price: s.price * 10000
}));

export const INITIAL_PRODUCTS: Product[] = RAW_PRODUCTS.map(p => ({
  ...p,
  price: p.price * 10000,
  cost: p.cost * 10000
}));

export const INITIAL_CUSTOMERS: Customer[] = RAW_CUSTOMERS.map(c => ({
  ...c,
  totalSpend: c.totalSpend * 10000
}));

export const INITIAL_BOOKINGS: Booking[] = RAW_BOOKINGS.map(b => ({
  ...b,
  price: b.price * 10000
}));

export const INITIAL_TRANSACTIONS: Transaction[] = RAW_TRANSACTIONS.map(tx => ({
  ...tx,
  subtotal: tx.subtotal * 10000,
  discount: tx.discount * 10000,
  total: tx.total * 10000,
  items: tx.items.map(item => ({
    ...item,
    price: item.price * 10000
  }))
}));

export const INITIAL_EXPENSES: Expense[] = RAW_EXPENSES.map(e => ({
  ...e,
  amount: e.amount * 10000
}));

export const INITIAL_ATTENDANCE: Attendance[] = [
  {
    id: 'att1',
    userId: 'u4',
    userName: 'Lisa Wong',
    role: 'THERAPIST',
    branch: 'NAO_STUDIO',
    date: '2026-07-12',
    clockIn: '09:00:00',
    status: 'active',
    notes: 'Morning shift started on time'
  },
  {
    id: 'att2',
    userId: 'u3',
    userName: 'Elena Rostova',
    role: 'SALON_MANAGER',
    branch: 'DIAEL_BEAUTY',
    date: '2026-07-12',
    clockIn: '08:45:00',
    status: 'active',
    notes: 'Sunday opening'
  },
  {
    id: 'att3',
    userId: 'u5',
    userName: 'Anna Smith',
    role: 'THERAPIST',
    branch: 'DIAEL_BEAUTY',
    date: '2026-07-12',
    clockIn: '09:00:00',
    clockOut: '17:00:00',
    status: 'completed',
    notes: 'Completed full shift'
  },
  {
    id: 'att4',
    userId: 'u2',
    userName: 'Sarah Jenkins',
    role: 'SALON_MANAGER',
    branch: 'NAO_STUDIO',
    date: '2026-07-11',
    clockIn: '09:00:00',
    clockOut: '18:15:00',
    status: 'completed'
  },
  {
    id: 'att5',
    userId: 'u4',
    userName: 'Lisa Wong',
    role: 'THERAPIST',
    branch: 'NAO_STUDIO',
    date: '2026-07-11',
    clockIn: '10:00:00',
    clockOut: '19:00:00',
    status: 'completed'
  }
];
