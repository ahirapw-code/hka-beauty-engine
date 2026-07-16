import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

export const BRANCHES = ["NAO_STUDIO", "DIAEL_BEAUTY"] as const;
export const SERVICE_CATEGORIES = ["Hair", "Nails", "Lashes", "Skincare", "Massage"] as const;
export const BOOKING_STATUSES = ["pending", "checked_in", "completed", "cancelled"] as const;
export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "e_wallet"] as const;
export const DISCOUNT_TYPES = ["percent", "flat"] as const;

// Mongo/Firestore-style custom string ids used throughout this app
// (e.g. "CUS-abc123", "TX-...", a Google/JWT uid, etc.) -- deliberately
// permissive about the exact shape, just bounded and non-empty, since the
// original app never enforced a single id format across collections.
export const idParamSchema = z.object({
  id: z.string().min(1, "id is required").max(200),
});

/* ------------------------------------------------------------------ */
/* Login                                                                */
/* ------------------------------------------------------------------ */

export const loginBodySchema = z.object({
  email: z.string().trim().min(1, "Email and password are required.").email("Invalid email format."),
  password: z.string().min(1, "Email and password are required."),
});

/* ------------------------------------------------------------------ */
/* Checkout (POST /api/processCheckout)                                 */
/* ------------------------------------------------------------------ */

const MAX_QUANTITY_PER_LINE = 999;

export const cartItemSchema = z
  .object({
    type: z.enum(["product", "service"], { errorMap: () => ({ message: 'type must be "product" or "service".' }) }),
    id: z.string().min(1, "Cart item is missing an id."),
    quantity: z
      .number()
      .int("quantity must be a positive integer.")
      .positive("quantity must be a positive integer.")
      .max(MAX_QUANTITY_PER_LINE, `quantity cannot exceed ${MAX_QUANTITY_PER_LINE}.`),
    discountType: z.enum(DISCOUNT_TYPES).optional(),
    discountValue: z.number().finite().min(0, "discountValue must be a non-negative number.").optional(),
    therapistId: z.string().optional(),
  })
  .refine((item) => (item.discountType === "percent" ? (item.discountValue ?? 0) <= 100 : true), {
    message: "percent discount cannot exceed 100.",
    path: ["discountValue"],
  });

export const checkoutBodySchema = z.object({
  cart: z.array(cartItemSchema).min(1, "cart must contain at least one item."),
  invoiceDiscountValue: z.number().finite().min(0).optional(),
  invoiceDiscountType: z.enum(DISCOUNT_TYPES).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: "Invalid paymentMethod." }) }),
  customerName: z.string().trim().min(1).max(200).optional(),
  customerId: z.string().trim().min(1).max(200).optional(),
  branch: z.enum(BRANCHES, { errorMap: () => ({ message: "Invalid branch." }) }),
  cashierName: z.string().trim().min(1).max(200).optional(),
  idempotencyKey: z.string().trim().min(1, "Missing required idempotencyKey.").max(200),
});

/* ------------------------------------------------------------------ */
/* Attendance / clock in-out (POST /api/clockInOut)                     */
/* ------------------------------------------------------------------ */

const attendanceRecordSchema = z.object({
  userId: z.string().min(1),
  userName: z.string().min(1),
  role: z.enum(["HKA_MANAGEMENT", "SALON_MANAGER", "THERAPIST"]),
  branch: z.enum(BRANCHES),
  date: z.string().min(1),
  clockIn: z.string().min(1),
  notes: z.string().optional(),
});

const clockOutRecordSchema = z.object({
  clockOut: z.string().min(1, "clockOut is required."),
  notes: z.string().optional(),
});

export const clockInOutBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("clockIn"),
    record: attendanceRecordSchema,
  }),
  z.object({
    action: z.literal("clockOut"),
    attendanceId: z.string().min(1, "Missing attendanceId parameter."),
    record: clockOutRecordSchema,
  }),
]);

/* ------------------------------------------------------------------ */
/* Generic /api/data/:collection query string (list endpoint)           */
/* Mirrors Firestore's where()/orderBy()/limit() used by the frontend.  */
/* ------------------------------------------------------------------ */

const whereClausePattern = /^[A-Za-z0-9_.]+,(==|!=|<|<=|>|>=),.*$/;

export const dataListQuerySchema = z.object({
  where: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
    .refine((clauses) => clauses.every((c) => whereClausePattern.test(c)), {
      message: 'Each "where" clause must look like "field,op,value" (op one of ==, !=, <, <=, >, >=).',
    }),
  orderBy: z
    .string()
    .regex(/^[A-Za-z0-9_.]+(,(asc|desc))?$/, 'orderBy must look like "field" or "field,asc|desc".')
    .optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

/* ------------------------------------------------------------------ */
/* Customer (collection: "customers")                                   */
/* ------------------------------------------------------------------ */

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required.").max(200),
  email: z.string().trim().email("Invalid email format.").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
  preferredBranch: z.enum(BRANCHES, { errorMap: () => ({ message: "Invalid preferredBranch." }) }),
  // totalSpend/visitsCount/lastVisit are server/business-logic derived
  // (updated by checkout), but the original API allowed setting them via the
  // generic Firestore-style endpoint, so we still accept them here, just
  // bounded to sane types instead of accepting anything.
  totalSpend: z.number().finite().min(0).optional(),
  visitsCount: z.number().int().min(0).optional(),
  lastVisit: z.string().optional(),
});

// PATCH (partial update) allows any subset of the same fields.
export const customerUpdateSchema = customerCreateSchema.partial();

/* ------------------------------------------------------------------ */
/* Booking (collection: "bookings")                                     */
/* ------------------------------------------------------------------ */

export const bookingCreateSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().max(30).optional().or(z.literal("")),
  serviceId: z.string().trim().min(1),
  serviceName: z.string().trim().min(1),
  therapistId: z.string().trim().min(1),
  therapistName: z.string().trim().min(1),
  branch: z.enum(BRANCHES, { errorMap: () => ({ message: "Invalid branch." }) }),
  date: z.string().trim().min(1),
  time: z.string().trim().min(1),
  duration: z.number().finite().positive(),
  price: z.number().finite().min(0),
  status: z.enum(BOOKING_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
});

export const bookingUpdateSchema = bookingCreateSchema.partial();

/**
 * Used only by PATCH /api/bookings/:id/status (see recordsController.ts) -
 * the one legitimate "update" allowed on the otherwise write-locked
 * "bookings" collection, since check-in/complete/cancel are real-time
 * front-desk actions and can't reasonably wait on a Google Sheet edit.
 */
export const bookingStatusUpdateSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
});

/* ------------------------------------------------------------------ */
/* Product (collection: "products")                                     */
/* ------------------------------------------------------------------ */

export const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(100),
  price: z.number().finite().min(0),
  cost: z.number().finite().min(0).optional(),
  stock: z.number().finite().min(0).optional(),
  minStock: z.number().finite().min(0).optional(),
  branch: z.enum(BRANCHES, { errorMap: () => ({ message: "Invalid branch." }) }),
  category: z.string().trim().min(1).max(100),
});

export const productUpdateSchema = productCreateSchema.partial();

/* ------------------------------------------------------------------ */
/* Service (collection: "services")                                     */
/* ------------------------------------------------------------------ */

export const serviceCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.enum(SERVICE_CATEGORIES, { errorMap: () => ({ message: "Invalid service category." }) }),
  price: z.number().finite().min(0),
  duration: z.number().finite().positive(),
  branches: z.array(z.enum(BRANCHES)).optional(),
});

export const serviceUpdateSchema = serviceCreateSchema.partial();

/* ------------------------------------------------------------------ */
/* Batch seed (POST /api/data/:collection/_batch)                       */
/* ------------------------------------------------------------------ */

export const batchSeedBodySchema = z.object({
  docs: z
    .array(
      z.object({
        id: z.string().min(1),
        data: z.record(z.any()),
      })
    )
    .max(5000, "Too many documents in a single batch seed request."),
});

/**
 * Maps a collection name (as used in /api/data/:collection) to its create
 * and update body schemas. Only collections in-scope for this validation
 * pass (customers, bookings, products, services) are listed here -- any
 * other collection is intentionally left unvalidated by Zod for now and
 * keeps behaving exactly as before.
 */
export const COLLECTION_BODY_SCHEMAS: Record<string, { create: z.ZodTypeAny; update: z.ZodTypeAny }> = {
  customers: { create: customerCreateSchema, update: customerUpdateSchema },
  bookings: { create: bookingCreateSchema, update: bookingUpdateSchema },
  products: { create: productCreateSchema, update: productUpdateSchema },
  services: { create: serviceCreateSchema, update: serviceUpdateSchema },
};
