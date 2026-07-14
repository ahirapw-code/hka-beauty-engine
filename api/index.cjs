var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/vercelEntry.ts
var vercelEntry_exports = {};
__export(vercelEntry_exports, {
  default: () => vercelEntry_default
});
module.exports = __toCommonJS(vercelEntry_exports);
var import_config = require("dotenv/config");

// server/app.ts
var import_express5 = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);

// server/routes/authRoutes.ts
var import_express = require("express");

// server/controllers/authController.ts
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var import_crypto = __toESM(require("crypto"), 1);

// server/config/jwt.ts
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16) {
  throw new Error(
    "FATAL: JWT_SECRET is not set (or is too short). Set a long, random JWT_SECRET in your environment before starting the server. Generate one with: openssl rand -hex 64"
  );
}
var JWT_SECRET = process.env.JWT_SECRET;
var JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

// server/models/User.ts
var import_mongoose2 = __toESM(require("mongoose"), 1);

// server/models/baseSchema.ts
var import_mongoose = __toESM(require("mongoose"), 1);
var { Schema } = import_mongoose.default;
var baseSchemaOptions = {
  _id: false,
  versionKey: false,
  timestamps: false,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.__v;
      return ret;
    }
  }
};
function withId(schema) {
  schema.add({ _id: { type: String, required: true } });
  schema.virtual("id").get(function() {
    return this._id;
  });
  return schema;
}

// server/models/User.ts
var { Schema: Schema2, model, models } = import_mongoose2.default;
var UserSchema = new Schema2(
  {
    username: { type: String, required: true },
    name: { type: String, required: true },
    role: {
      type: String,
      enum: ["HKA_MANAGEMENT", "SALON_MANAGER", "THERAPIST"],
      required: true
    },
    branch: {
      type: String,
      enum: ["NAO_STUDIO", "DIAEL_BEAUTY", "ALL"],
      required: true
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String },
    forcePasswordChange: { type: Boolean, default: false }
  },
  baseSchemaOptions
);
withId(UserSchema);
UserSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  }
});
var User_default = models.User || model("User", UserSchema, "users");

// server/controllers/authController.ts
function signToken(uid, email) {
  return import_jsonwebtoken.default.sign({ uid, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function newUserId() {
  return import_crypto.default.randomUUID();
}
async function register(req, res) {
  try {
    const { email, password, username, name, role, branch, avatar } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password should be at least 6 characters." });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User_default.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "This email address is already registered. Please sign in instead." });
    }
    const passwordHash = await import_bcryptjs.default.hash(password, 10);
    const uid = newUserId();
    const fallbackUsername = username || normalizedEmail.split("@")[0];
    const newUser = await User_default.create({
      _id: uid,
      username: String(fallbackUsername).trim().toLowerCase(),
      name: name ? String(name).trim() : fallbackUsername,
      role: role || "THERAPIST",
      branch: branch || "NAO_STUDIO",
      email: normalizedEmail,
      passwordHash,
      avatar: avatar || `https://i.pravatar.cc/150?u=${fallbackUsername}`,
      forcePasswordChange: false
    });
    const token = signToken(uid, normalizedEmail);
    return res.status(201).json({ token, user: newUser.toJSON() });
  } catch (err) {
    console.error("Error in register:", err);
    return res.status(500).json({ error: err.message || "Registration failed." });
  }
}
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User_default.findOne({ email: normalizedEmail }).select("+passwordHash");
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password. Please verify your credentials." });
    }
    const valid = await import_bcryptjs.default.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password. Please verify your credentials." });
    }
    const token = signToken(user._id, user.email);
    return res.status(200).json({ token, user: user.toJSON() });
  } catch (err) {
    console.error("Error in login:", err);
    return res.status(500).json({ error: err.message || "Authentication failed." });
  }
}
async function me(req, res) {
  try {
    if (!req.auth) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    const user = await User_default.findById(req.auth.uid);
    if (!user) {
      return res.status(404).json({ error: "User profile not found." });
    }
    return res.status(200).json({ user: user.toJSON() });
  } catch (err) {
    console.error("Error in me:", err);
    return res.status(500).json({ error: err.message || "Failed to load profile." });
  }
}
async function changePassword(req, res) {
  try {
    if (!req.auth) {
      return res.status(401).json({ error: "Unauthorized." });
    }
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: "Password baru minimal 6 karakter." });
    }
    const passwordHash = await import_bcryptjs.default.hash(newPassword, 10);
    const user = await User_default.findByIdAndUpdate(
      req.auth.uid,
      { passwordHash, forcePasswordChange: false },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ error: "User profile not found." });
    }
    return res.status(200).json({ success: true, user: user.toJSON() });
  } catch (err) {
    console.error("Error in changePassword:", err);
    return res.status(500).json({ error: err.message || "Gagal mengubah password." });
  }
}

// server/middleware/auth.ts
var import_jsonwebtoken2 = __toESM(require("jsonwebtoken"), 1);
async function verifyUserToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = import_jsonwebtoken2.default.verify(token, JWT_SECRET);
    return { uid: decoded.uid, email: decoded.email || "" };
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}
async function requireAuth(req, res, next) {
  const caller = await verifyUserToken(req.headers.authorization);
  if (!caller) {
    return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
  }
  req.auth = caller;
  next();
}
async function requireAuthWithProfile(req, res, next) {
  const caller = await verifyUserToken(req.headers.authorization);
  if (!caller) {
    return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
  }
  const userDoc = await User_default.findById(caller.uid).select("+passwordHash");
  if (!userDoc) {
    return res.status(403).json({ error: "Forbidden: User profile not found." });
  }
  req.auth = {
    uid: caller.uid,
    email: caller.email,
    role: userDoc.role,
    branch: userDoc.branch
  };
  next();
}

// server/middleware/validate.ts
var import_zod = require("zod");
function formatZodError(err) {
  return err.issues.map((issue) => {
    const path = issue.path.join(".") || "(root)";
    return `${path}: ${issue.message}`;
  }).join("; ");
}
function validate(targets) {
  return (req, res, next) => {
    try {
      if (targets.body) {
        req.body = targets.body.parse(req.body);
      }
      if (targets.params) {
        req.params = targets.params.parse(req.params);
      }
      if (targets.query) {
        req.query = targets.query.parse(req.query);
      }
      next();
    } catch (err) {
      if (err instanceof import_zod.ZodError) {
        return res.status(400).json({ error: `Validation failed: ${formatZodError(err)}` });
      }
      return res.status(400).json({ error: "Validation failed: invalid request." });
    }
  };
}

// server/validation/schemas.ts
var import_zod2 = require("zod");
var BRANCHES = ["NAO_STUDIO", "DIAEL_BEAUTY"];
var SERVICE_CATEGORIES = ["Hair", "Nails", "Lashes", "Skincare", "Massage"];
var BOOKING_STATUSES = ["pending", "checked_in", "completed", "cancelled"];
var PAYMENT_METHODS = ["cash", "card", "bank_transfer", "e_wallet"];
var DISCOUNT_TYPES = ["percent", "flat"];
var idParamSchema = import_zod2.z.object({
  id: import_zod2.z.string().min(1, "id is required").max(200)
});
var loginBodySchema = import_zod2.z.object({
  email: import_zod2.z.string().trim().min(1, "Email and password are required.").email("Invalid email format."),
  password: import_zod2.z.string().min(1, "Email and password are required.")
});
var MAX_QUANTITY_PER_LINE = 999;
var cartItemSchema = import_zod2.z.object({
  type: import_zod2.z.enum(["product", "service"], { errorMap: () => ({ message: 'type must be "product" or "service".' }) }),
  id: import_zod2.z.string().min(1, "Cart item is missing an id."),
  quantity: import_zod2.z.number().int("quantity must be a positive integer.").positive("quantity must be a positive integer.").max(MAX_QUANTITY_PER_LINE, `quantity cannot exceed ${MAX_QUANTITY_PER_LINE}.`),
  discountType: import_zod2.z.enum(DISCOUNT_TYPES).optional(),
  discountValue: import_zod2.z.number().finite().min(0, "discountValue must be a non-negative number.").optional(),
  therapistId: import_zod2.z.string().optional()
}).refine((item) => item.discountType === "percent" ? (item.discountValue ?? 0) <= 100 : true, {
  message: "percent discount cannot exceed 100.",
  path: ["discountValue"]
});
var checkoutBodySchema = import_zod2.z.object({
  cart: import_zod2.z.array(cartItemSchema).min(1, "cart must contain at least one item."),
  invoiceDiscountValue: import_zod2.z.number().finite().min(0).optional(),
  invoiceDiscountType: import_zod2.z.enum(DISCOUNT_TYPES).optional(),
  paymentMethod: import_zod2.z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: "Invalid paymentMethod." }) }),
  customerName: import_zod2.z.string().trim().min(1).max(200).optional(),
  customerId: import_zod2.z.string().trim().min(1).max(200).optional(),
  branch: import_zod2.z.enum(BRANCHES, { errorMap: () => ({ message: "Invalid branch." }) }),
  cashierName: import_zod2.z.string().trim().min(1).max(200).optional(),
  idempotencyKey: import_zod2.z.string().trim().min(1, "Missing required idempotencyKey.").max(200)
});
var attendanceRecordSchema = import_zod2.z.object({
  userId: import_zod2.z.string().min(1),
  userName: import_zod2.z.string().min(1),
  role: import_zod2.z.enum(["HKA_MANAGEMENT", "SALON_MANAGER", "THERAPIST"]),
  branch: import_zod2.z.enum(BRANCHES),
  date: import_zod2.z.string().min(1),
  clockIn: import_zod2.z.string().min(1),
  notes: import_zod2.z.string().optional()
});
var clockOutRecordSchema = import_zod2.z.object({
  clockOut: import_zod2.z.string().min(1, "clockOut is required."),
  notes: import_zod2.z.string().optional()
});
var clockInOutBodySchema = import_zod2.z.discriminatedUnion("action", [
  import_zod2.z.object({
    action: import_zod2.z.literal("clockIn"),
    record: attendanceRecordSchema
  }),
  import_zod2.z.object({
    action: import_zod2.z.literal("clockOut"),
    attendanceId: import_zod2.z.string().min(1, "Missing attendanceId parameter."),
    record: clockOutRecordSchema
  })
]);
var whereClausePattern = /^[A-Za-z0-9_.]+,(==|!=|<|<=|>|>=),.*$/;
var dataListQuerySchema = import_zod2.z.object({
  where: import_zod2.z.union([import_zod2.z.string(), import_zod2.z.array(import_zod2.z.string())]).optional().transform((v) => v === void 0 ? [] : Array.isArray(v) ? v : [v]).refine((clauses) => clauses.every((c) => whereClausePattern.test(c)), {
    message: 'Each "where" clause must look like "field,op,value" (op one of ==, !=, <, <=, >, >=).'
  }),
  orderBy: import_zod2.z.string().regex(/^[A-Za-z0-9_.]+(,(asc|desc))?$/, 'orderBy must look like "field" or "field,asc|desc".').optional(),
  limit: import_zod2.z.coerce.number().int().positive().max(1e3).optional()
});
var customerCreateSchema = import_zod2.z.object({
  name: import_zod2.z.string().trim().min(1, "name is required.").max(200),
  email: import_zod2.z.string().trim().email("Invalid email format.").optional().or(import_zod2.z.literal("")),
  phone: import_zod2.z.string().trim().max(30).optional().or(import_zod2.z.literal("")),
  notes: import_zod2.z.string().max(2e3).optional(),
  preferredBranch: import_zod2.z.enum(BRANCHES, { errorMap: () => ({ message: "Invalid preferredBranch." }) }),
  // totalSpend/visitsCount/lastVisit are server/business-logic derived
  // (updated by checkout), but the original API allowed setting them via the
  // generic Firestore-style endpoint, so we still accept them here, just
  // bounded to sane types instead of accepting anything.
  totalSpend: import_zod2.z.number().finite().min(0).optional(),
  visitsCount: import_zod2.z.number().int().min(0).optional(),
  lastVisit: import_zod2.z.string().optional()
});
var customerUpdateSchema = customerCreateSchema.partial();
var bookingCreateSchema = import_zod2.z.object({
  customerName: import_zod2.z.string().trim().min(1).max(200),
  customerPhone: import_zod2.z.string().trim().max(30).optional().or(import_zod2.z.literal("")),
  serviceId: import_zod2.z.string().trim().min(1),
  serviceName: import_zod2.z.string().trim().min(1),
  therapistId: import_zod2.z.string().trim().min(1),
  therapistName: import_zod2.z.string().trim().min(1),
  branch: import_zod2.z.enum(BRANCHES, { errorMap: () => ({ message: "Invalid branch." }) }),
  date: import_zod2.z.string().trim().min(1),
  time: import_zod2.z.string().trim().min(1),
  duration: import_zod2.z.number().finite().positive(),
  price: import_zod2.z.number().finite().min(0),
  status: import_zod2.z.enum(BOOKING_STATUSES).optional(),
  notes: import_zod2.z.string().max(2e3).optional()
});
var bookingUpdateSchema = bookingCreateSchema.partial();
var productCreateSchema = import_zod2.z.object({
  name: import_zod2.z.string().trim().min(1).max(200),
  sku: import_zod2.z.string().trim().min(1).max(100),
  price: import_zod2.z.number().finite().min(0),
  cost: import_zod2.z.number().finite().min(0).optional(),
  stock: import_zod2.z.number().finite().min(0).optional(),
  minStock: import_zod2.z.number().finite().min(0).optional(),
  branch: import_zod2.z.enum(BRANCHES, { errorMap: () => ({ message: "Invalid branch." }) }),
  category: import_zod2.z.string().trim().min(1).max(100)
});
var productUpdateSchema = productCreateSchema.partial();
var serviceCreateSchema = import_zod2.z.object({
  name: import_zod2.z.string().trim().min(1).max(200),
  category: import_zod2.z.enum(SERVICE_CATEGORIES, { errorMap: () => ({ message: "Invalid service category." }) }),
  price: import_zod2.z.number().finite().min(0),
  duration: import_zod2.z.number().finite().positive(),
  branches: import_zod2.z.array(import_zod2.z.enum(BRANCHES)).optional()
});
var serviceUpdateSchema = serviceCreateSchema.partial();
var batchSeedBodySchema = import_zod2.z.object({
  docs: import_zod2.z.array(
    import_zod2.z.object({
      id: import_zod2.z.string().min(1),
      data: import_zod2.z.record(import_zod2.z.any())
    })
  ).max(5e3, "Too many documents in a single batch seed request.")
});
var COLLECTION_BODY_SCHEMAS = {
  customers: { create: customerCreateSchema, update: customerUpdateSchema },
  bookings: { create: bookingCreateSchema, update: bookingUpdateSchema },
  products: { create: productCreateSchema, update: productUpdateSchema },
  services: { create: serviceCreateSchema, update: serviceUpdateSchema }
};

// server/routes/authRoutes.ts
var router = (0, import_express.Router)();
router.post("/register", register);
router.post("/login", validate({ body: loginBodySchema }), login);
router.get("/me", requireAuth, me);
router.post("/change-password", requireAuth, changePassword);
var authRoutes_default = router;

// server/routes/dataRoutes.ts
var import_express2 = require("express");

// server/models/Customer.ts
var import_mongoose3 = __toESM(require("mongoose"), 1);
var { Schema: Schema3, model: model2, models: models2 } = import_mongoose3.default;
var CustomerSchema = new Schema3(
  {
    name: { type: String, required: true },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    totalSpend: { type: Number, default: 0 },
    visitsCount: { type: Number, default: 0 },
    lastVisit: { type: String },
    notes: { type: String },
    preferredBranch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true }
  },
  baseSchemaOptions
);
withId(CustomerSchema);
var Customer_default = models2.Customer || model2("Customer", CustomerSchema, "customers");

// server/models/Therapist.ts
var import_mongoose4 = __toESM(require("mongoose"), 1);
var { Schema: Schema4, model: model3, models: models3 } = import_mongoose4.default;
var TherapistSchema = new Schema4(
  {
    name: { type: String, required: true },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    specialties: { type: [String], default: [] },
    rating: { type: Number, default: 0 },
    commissionRate: { type: Number, default: 0 },
    totalCommissionEarned: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    monthlyTarget: { type: Number, default: 0 },
    currentSales: { type: Number, default: 0 },
    baseSalary: { type: Number, default: 0 }
  },
  baseSchemaOptions
);
withId(TherapistSchema);
var Therapist_default = models3.Therapist || model3("Therapist", TherapistSchema, "therapists");

// server/models/Product.ts
var import_mongoose5 = __toESM(require("mongoose"), 1);
var { Schema: Schema5, model: model4, models: models4 } = import_mongoose5.default;
var ProductSchema = new Schema5(
  {
    name: { type: String, required: true },
    sku: { type: String, required: true },
    price: { type: Number, required: true },
    cost: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    minStock: { type: Number, default: 0 },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    category: { type: String, required: true }
  },
  baseSchemaOptions
);
withId(ProductSchema);
var Product_default = models4.Product || model4("Product", ProductSchema, "products");

// server/models/Service.ts
var import_mongoose6 = __toESM(require("mongoose"), 1);
var { Schema: Schema6, model: model5, models: models5 } = import_mongoose6.default;
var ServiceSchema = new Schema6(
  {
    name: { type: String, required: true },
    category: {
      type: String,
      enum: ["Hair", "Nails", "Lashes", "Skincare", "Massage"],
      required: true
    },
    price: { type: Number, required: true },
    duration: { type: Number, required: true },
    branches: { type: [String], default: [] }
  },
  baseSchemaOptions
);
withId(ServiceSchema);
var Service_default = models5.Service || model5("Service", ServiceSchema, "services");

// server/models/Transaction.ts
var import_mongoose7 = __toESM(require("mongoose"), 1);
var { Schema: Schema7, model: model6, models: models6 } = import_mongoose7.default;
var TransactionItemSchema = new Schema7(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    type: { type: String, enum: ["service", "product"], required: true },
    therapistId: { type: String },
    discountValue: { type: Number, default: 0 },
    discountType: { type: String, enum: ["percent", "flat"], default: "flat" }
  },
  { _id: false }
);
var TransactionSchema = new Schema7(
  {
    customerName: { type: String, default: "" },
    customerId: { type: String },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    items: { type: [TransactionItemSchema], default: [] },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "bank_transfer", "e_wallet"],
      required: true
    },
    date: { type: String, required: true },
    cashierName: { type: String, default: "" },
    idempotencyKey: { type: String, unique: true, sparse: true }
  },
  baseSchemaOptions
);
withId(TransactionSchema);
var Transaction_default = models6.Transaction || model6("Transaction", TransactionSchema, "transactions");

// server/models/Attendance.ts
var import_mongoose8 = __toESM(require("mongoose"), 1);
var { Schema: Schema8, model: model7, models: models7 } = import_mongoose8.default;
var AttendanceSchema = new Schema8(
  {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    role: {
      type: String,
      enum: ["HKA_MANAGEMENT", "SALON_MANAGER", "THERAPIST"],
      required: true
    },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    date: { type: String, required: true },
    clockIn: { type: String, required: true },
    clockOut: { type: String },
    status: { type: String, enum: ["active", "completed"], default: "active" },
    notes: { type: String, default: "" }
  },
  baseSchemaOptions
);
withId(AttendanceSchema);
var Attendance_default = models7.Attendance || model7("Attendance", AttendanceSchema, "attendance");

// server/models/PayrollAuditLog.ts
var import_mongoose9 = __toESM(require("mongoose"), 1);
var { Schema: Schema9, model: model8, models: models8, Types } = import_mongoose9.default;
var PayrollAuditLogSchema = new Schema9(
  {
    therapistId: { type: String, required: true },
    field: { type: String, required: true },
    oldValue: { type: Schema9.Types.Mixed, default: null },
    newValue: { type: Schema9.Types.Mixed, default: null },
    source: { type: String, required: true },
    timestamp: { type: String, required: true }
  },
  {
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id?.toString?.() ?? ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);
var PayrollAuditLog_default = models8.PayrollAuditLog || model8("PayrollAuditLog", PayrollAuditLogSchema, "payrollAuditLog");

// server/models/Booking.ts
var import_mongoose10 = __toESM(require("mongoose"), 1);
var { Schema: Schema10, model: model9, models: models9 } = import_mongoose10.default;
var BookingSchema = new Schema10(
  {
    customerName: { type: String, required: true },
    customerPhone: { type: String, default: "" },
    serviceId: { type: String, required: true },
    serviceName: { type: String, required: true },
    therapistId: { type: String, required: true },
    therapistName: { type: String, required: true },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    duration: { type: Number, required: true },
    price: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "checked_in", "completed", "cancelled"],
      default: "pending"
    },
    notes: { type: String, default: "" }
  },
  baseSchemaOptions
);
withId(BookingSchema);
var Booking_default = models9.Booking || model9("Booking", BookingSchema, "bookings");

// server/models/Expense.ts
var import_mongoose11 = __toESM(require("mongoose"), 1);
var { Schema: Schema11, model: model10, models: models10 } = import_mongoose11.default;
var ExpenseSchema = new Schema11(
  {
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    category: {
      type: String,
      enum: ["Rent", "Utilities", "Supplies", "Marketing", "Salaries", "Other"],
      required: true
    },
    amount: { type: Number, required: true },
    date: { type: String, required: true },
    description: { type: String, default: "" }
  },
  baseSchemaOptions
);
withId(ExpenseSchema);
var Expense_default = models10.Expense || model10("Expense", ExpenseSchema, "expenses");

// server/models/Payroll.ts
var import_mongoose12 = __toESM(require("mongoose"), 1);
var { Schema: Schema12, model: model11, models: models11 } = import_mongoose12.default;
var PayrollSchema = new Schema12(
  {
    staffId: { type: String, required: true },
    staffName: { type: String, required: true },
    staffType: { type: String, enum: ["therapist", "manager"], required: true },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    periodMonth: { type: String, required: true },
    baseSalary: { type: Number, default: 0 },
    commissionEarned: { type: Number, default: 0 },
    daysPresent: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 },
    status: { type: String, enum: ["draft", "finalized", "paid"], default: "draft" },
    generatedAt: { type: String, required: true },
    generatedBy: { type: String, default: "" }
  },
  baseSchemaOptions
);
withId(PayrollSchema);
var Payroll_default = models11.Payroll || model11("Payroll", PayrollSchema, "payroll");

// server/models/Setting.ts
var import_mongoose13 = __toESM(require("mongoose"), 1);
var { Schema: Schema13, model: model12, models: models12 } = import_mongoose13.default;
var SettingSchema = new Schema13({}, { ...baseSchemaOptions, strict: false });
withId(SettingSchema);
var Setting_default = models12.Setting || model12("Setting", SettingSchema, "settings");

// server/models/Upload.ts
var import_mongoose14 = __toESM(require("mongoose"), 1);
var { Schema: Schema14, model: model13, models: models13 } = import_mongoose14.default;
var UploadSchema = new Schema14({
  _id: { type: String, required: true },
  contentType: { type: String, required: true },
  dataBase64: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
var Upload_default = models13.Upload || model13("Upload", UploadSchema, "uploads");

// server/models/index.ts
var collectionRegistry = {
  customers: Customer_default,
  therapists: Therapist_default,
  products: Product_default,
  services: Service_default,
  transactions: Transaction_default,
  attendance: Attendance_default,
  users: User_default,
  bookings: Booking_default,
  expenses: Expense_default,
  payroll: Payroll_default,
  settings: Setting_default
};

// server/controllers/dataController.ts
function getModel(req, res) {
  const { collection } = req.params;
  const model14 = collectionRegistry[collection];
  if (!model14) {
    res.status(404).json({ error: `Unknown collection "${collection}".` });
    return null;
  }
  return model14;
}
function buildFilter(whereParams) {
  if (!whereParams) return {};
  const clauses = Array.isArray(whereParams) ? whereParams : [whereParams];
  const filter = {};
  for (const clause of clauses) {
    const [field, op, ...rest] = String(clause).split(",");
    if (!field || !op) continue;
    let value = rest.join(",");
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (value !== "" && !isNaN(Number(value))) value = Number(value);
    switch (op) {
      case "==":
        filter[field] = value;
        break;
      case "!=":
        filter[field] = { ...filter[field] || {}, $ne: value };
        break;
      case "<":
        filter[field] = { ...filter[field] || {}, $lt: value };
        break;
      case "<=":
        filter[field] = { ...filter[field] || {}, $lte: value };
        break;
      case ">":
        filter[field] = { ...filter[field] || {}, $gt: value };
        break;
      case ">=":
        filter[field] = { ...filter[field] || {}, $gte: value };
        break;
      default:
        break;
    }
  }
  return filter;
}
async function listDocuments(req, res) {
  const model14 = getModel(req, res);
  if (!model14) return;
  try {
    const filter = buildFilter(req.query.where);
    let cursor = model14.find(filter);
    if (req.query.orderBy) {
      const [field, direction] = String(req.query.orderBy).split(",");
      cursor = cursor.sort({ [field]: direction === "desc" ? -1 : 1 });
    }
    if (req.query.limit) {
      cursor = cursor.limit(Number(req.query.limit));
    }
    const docs = await cursor.exec();
    return res.status(200).json({ docs: docs.map((d) => d.toJSON()) });
  } catch (err) {
    console.error(`Error listing ${req.params.collection}:`, err);
    return res.status(500).json({ error: err.message || "Failed to list documents." });
  }
}
async function getDocument(req, res) {
  const model14 = getModel(req, res);
  if (!model14) return;
  try {
    const doc = await model14.findById(req.params.id);
    if (!doc) {
      return res.status(200).json({ exists: false, data: null });
    }
    return res.status(200).json({ exists: true, data: doc.toJSON() });
  } catch (err) {
    console.error(`Error getting ${req.params.collection}/${req.params.id}:`, err);
    return res.status(500).json({ error: err.message || "Failed to get document." });
  }
}
async function setDocument(req, res) {
  const model14 = getModel(req, res);
  if (!model14) return;
  try {
    const merge = req.query.merge === "true";
    const payload = { ...req.body, _id: req.params.id };
    delete payload.id;
    if (merge) {
      const updated = await model14.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return res.status(200).json({ success: true, data: updated.toJSON() });
    }
    const doc = await model14.findOneAndReplace({ _id: req.params.id }, payload, {
      upsert: true,
      new: true
    });
    return res.status(200).json({ success: true, data: doc.toJSON() });
  } catch (err) {
    console.error(`Error setting ${req.params.collection}/${req.params.id}:`, err);
    return res.status(500).json({ error: err.message || "Failed to save document." });
  }
}
async function updateDocument(req, res) {
  const model14 = getModel(req, res);
  if (!model14) return;
  try {
    const updated = await model14.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: "Document not found." });
    }
    return res.status(200).json({ success: true, data: updated.toJSON() });
  } catch (err) {
    console.error(`Error updating ${req.params.collection}/${req.params.id}:`, err);
    return res.status(500).json({ error: err.message || "Failed to update document." });
  }
}
async function deleteDocument(req, res) {
  const model14 = getModel(req, res);
  if (!model14) return;
  try {
    await model14.deleteOne({ _id: req.params.id });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(`Error deleting ${req.params.collection}/${req.params.id}:`, err);
    return res.status(500).json({ error: err.message || "Failed to delete document." });
  }
}
async function batchSetDocuments(req, res) {
  const model14 = getModel(req, res);
  if (!model14) return;
  try {
    const { docs } = req.body;
    if (!Array.isArray(docs)) {
      return res.status(400).json({ error: "Body must include a `docs` array." });
    }
    const existingCount = await model14.estimatedDocumentCount();
    if (existingCount > 0) {
      return res.status(200).json({ success: true, inserted: 0, skipped: docs.length });
    }
    const toInsert = docs.map((d) => ({ ...d.data, _id: d.id }));
    if (toInsert.length > 0) {
      await model14.insertMany(toInsert, { ordered: false });
    }
    return res.status(200).json({ success: true, inserted: toInsert.length });
  } catch (err) {
    console.error(`Error batch-seeding ${req.params.collection}:`, err);
    return res.status(500).json({ error: err.message || "Failed to seed documents." });
  }
}

// server/middleware/authorize.ts
var MANAGEMENT = ["HKA_MANAGEMENT", "SALON_MANAGER"];
var ALL_ROLES = ["HKA_MANAGEMENT", "SALON_MANAGER", "THERAPIST"];
var PROTECTED_FIELDS = {
  users: ["role", "branch", "passwordHash", "email", "forcePasswordChange"],
  therapists: ["currentSales", "totalCommissionEarned"]
};
var WRITE_LOCKED_COLLECTIONS = /* @__PURE__ */ new Set(["transactions", "attendance"]);
var POLICIES = {
  customers: { read: "all", write: MANAGEMENT },
  therapists: { read: "all", write: MANAGEMENT },
  products: { read: "all", write: MANAGEMENT },
  services: { read: "all", write: MANAGEMENT },
  transactions: { read: "all", write: ["HKA_MANAGEMENT"] },
  // write-locked below anyway
  attendance: {
    read: "all",
    write: ["HKA_MANAGEMENT"],
    // write-locked below anyway; corrections only
    selfScopedFor: ["THERAPIST"],
    ownerField: "userId"
  },
  bookings: { read: "all", write: ALL_ROLES },
  expenses: { read: MANAGEMENT, write: MANAGEMENT },
  payroll: {
    read: "all",
    write: MANAGEMENT,
    selfScopedFor: ["THERAPIST"],
    ownerField: "staffId"
  },
  settings: { read: "all", write: MANAGEMENT },
  users: {
    read: "all",
    write: MANAGEMENT,
    selfScopedFor: ["THERAPIST"],
    ownerField: "_id"
  }
};
function roleAllows(list, role) {
  return list === "all" || list.includes(role);
}
function authorizeCollectionAccess(action) {
  return (req, res, next) => {
    const collection = req.params.collection;
    const role = req.auth?.role;
    if (!role) {
      return res.status(403).json({ error: "Forbidden: user role could not be determined." });
    }
    const policy = POLICIES[collection];
    if (!policy) {
      return res.status(404).json({ error: `Unknown collection "${collection}".` });
    }
    if (action === "write") {
      if (WRITE_LOCKED_COLLECTIONS.has(collection)) {
        return res.status(403).json({
          error: `Forbidden: "${collection}" cannot be modified directly. Use the dedicated endpoint for this action.`
        });
      }
      const isSelfScoped = policy.selfScopedFor?.includes(role);
      const isManagementWriter = roleAllows(policy.write, role);
      if (!isManagementWriter && !isSelfScoped) {
        return res.status(403).json({
          error: `Forbidden: your role (${role}) may not modify "${collection}".`
        });
      }
      if (!isManagementWriter && isSelfScoped) {
        const targetId = req.params.id;
        const ownerField = policy.ownerField || "_id";
        if (ownerField === "_id") {
          if (targetId !== req.auth.uid) {
            return res.status(403).json({
              error: "Forbidden: you may only modify your own record."
            });
          }
        } else if (req.body && typeof req.body === "object") {
          const bodyOwner = req.body[ownerField];
          if (bodyOwner !== void 0 && bodyOwner !== req.auth.uid) {
            return res.status(403).json({
              error: "Forbidden: you may only modify your own records."
            });
          }
        }
      }
      const protectedFields = PROTECTED_FIELDS[collection];
      if (protectedFields && role !== "HKA_MANAGEMENT" && req.body && typeof req.body === "object") {
        for (const field of protectedFields) {
          if (field in req.body) delete req.body[field];
        }
      }
    } else {
      if (!roleAllows(policy.read, role)) {
        return res.status(403).json({
          error: `Forbidden: your role (${role}) may not view "${collection}".`
        });
      }
      const isManagementReader = MANAGEMENT.includes(role);
      if (!isManagementReader && policy.selfScopedFor?.includes(role)) {
        const ownerField = policy.ownerField || "_id";
        if (req.params.id) {
          if (ownerField === "_id" && req.params.id !== req.auth.uid) {
            return res.status(403).json({ error: "Forbidden: you may only view your own record." });
          }
        } else {
          const existing = [].concat(req.query.where || []);
          const filtered = existing.filter((w) => !String(w).startsWith(`${ownerField},`));
          filtered.push(`${ownerField},==,${req.auth.uid}`);
          req.query.where = filtered;
        }
      }
    }
    next();
  };
}

// server/middleware/validateDataCollection.ts
var import_zod3 = require("zod");
var IN_SCOPE_COLLECTIONS = /* @__PURE__ */ new Set(["customers", "bookings", "products", "services"]);
function formatZodError2(err) {
  return err.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
function respondInvalid(res, err) {
  if (err instanceof import_zod3.ZodError) {
    return res.status(400).json({ error: `Validation failed: ${formatZodError2(err)}` });
  }
  return res.status(400).json({ error: "Validation failed: invalid request." });
}
function validateDataIdParam(req, res, next) {
  if (!IN_SCOPE_COLLECTIONS.has(req.params.collection)) return next();
  try {
    req.params = { ...req.params, ...idParamSchema.parse(req.params) };
    next();
  } catch (err) {
    respondInvalid(res, err);
  }
}
function validateDataListQuery(req, res, next) {
  if (!IN_SCOPE_COLLECTIONS.has(req.params.collection)) return next();
  try {
    const parsed = dataListQuerySchema.parse(req.query);
    req.query.where = parsed.where;
    if (parsed.orderBy !== void 0) req.query.orderBy = parsed.orderBy;
    if (parsed.limit !== void 0) req.query.limit = String(parsed.limit);
    next();
  } catch (err) {
    respondInvalid(res, err);
  }
}
function validateDataCreateBody(req, res, next) {
  const schemaPair = COLLECTION_BODY_SCHEMAS[req.params.collection];
  if (!schemaPair) return next();
  try {
    const isMerge = req.query.merge === "true";
    req.body = (isMerge ? schemaPair.update : schemaPair.create).parse(req.body);
    next();
  } catch (err) {
    respondInvalid(res, err);
  }
}
function validateDataUpdateBody(req, res, next) {
  const schemaPair = COLLECTION_BODY_SCHEMAS[req.params.collection];
  if (!schemaPair) return next();
  try {
    req.body = schemaPair.update.parse(req.body);
    next();
  } catch (err) {
    respondInvalid(res, err);
  }
}
function validateDataBatchBody(req, res, next) {
  if (!IN_SCOPE_COLLECTIONS.has(req.params.collection)) return next();
  try {
    req.body = batchSeedBodySchema.parse(req.body);
    next();
  } catch (err) {
    respondInvalid(res, err);
  }
}

// server/routes/dataRoutes.ts
var router2 = (0, import_express2.Router)({ mergeParams: true });
router2.use(requireAuthWithProfile);
router2.get("/:collection", authorizeCollectionAccess("read"), validateDataListQuery, listDocuments);
router2.get("/:collection/:id", authorizeCollectionAccess("read"), validateDataIdParam, getDocument);
router2.post(
  "/:collection/_batch",
  authorizeCollectionAccess("write"),
  validateDataBatchBody,
  batchSetDocuments
);
router2.put(
  "/:collection/:id",
  authorizeCollectionAccess("write"),
  validateDataIdParam,
  validateDataCreateBody,
  setDocument
);
router2.patch(
  "/:collection/:id",
  authorizeCollectionAccess("write"),
  validateDataIdParam,
  validateDataUpdateBody,
  updateDocument
);
router2.delete("/:collection/:id", authorizeCollectionAccess("write"), validateDataIdParam, deleteDocument);
var dataRoutes_default = router2;

// server/routes/businessRoutes.ts
var import_express3 = require("express");

// server/controllers/checkoutController.ts
var import_mongoose15 = __toESM(require("mongoose"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
var VALID_BRANCHES = ["NAO_STUDIO", "DIAEL_BEAUTY"];
var VALID_PAYMENT_METHODS = ["cash", "card", "bank_transfer", "e_wallet"];
var VALID_DISCOUNT_TYPES = ["percent", "flat"];
var MAX_QUANTITY_PER_LINE2 = 999;
function isPositiveInteger(n) {
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= MAX_QUANTITY_PER_LINE2;
}
function isFiniteNonNegative(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}
function validateCartItem(item) {
  if (!item || typeof item !== "object") return "Invalid cart item.";
  if (item.type !== "product" && item.type !== "service") {
    return `Invalid item type "${item.type}".`;
  }
  if (!item.id || typeof item.id !== "string") return "Cart item is missing an id.";
  if (!isPositiveInteger(item.quantity)) {
    return `Invalid quantity for item ${item.id}: must be a positive integer.`;
  }
  const discountType = item.discountType || "flat";
  if (!VALID_DISCOUNT_TYPES.includes(discountType)) {
    return `Invalid discountType for item ${item.id}.`;
  }
  const discountValue = item.discountValue || 0;
  if (!isFiniteNonNegative(discountValue)) {
    return `Invalid discountValue for item ${item.id}: must be a non-negative number.`;
  }
  if (discountType === "percent" && discountValue > 100) {
    return `Invalid discountValue for item ${item.id}: percent discount cannot exceed 100.`;
  }
  return null;
}
async function processCheckout(req, res) {
  try {
    const {
      cart,
      invoiceDiscountValue,
      invoiceDiscountType,
      paymentMethod,
      customerName,
      customerId,
      branch,
      cashierName,
      idempotencyKey
    } = req.body;
    const authHeader = req.headers.authorization;
    const caller = await verifyUserToken(authHeader);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
    }
    const userData = await User_default.findById(caller.uid);
    if (!userData) {
      return res.status(403).json({ error: "Forbidden: User profile not found." });
    }
    const role = userData.role;
    if (role !== "HKA_MANAGEMENT" && role !== "SALON_MANAGER") {
      return res.status(403).json({ error: "Forbidden: Anda tidak memiliki wewenang untuk melakukan checkout." });
    }
    const userBranch = userData.branch;
    if (!VALID_BRANCHES.includes(branch)) {
      return res.status(400).json({ error: `Invalid branch "${branch}".` });
    }
    if (userBranch !== "ALL" && userBranch !== branch) {
      return res.status(403).json({ error: `Forbidden: Anda tidak berwenang mencatat transaksi untuk branch "${branch}".` });
    }
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart must be a non-empty array." });
    }
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: `Invalid paymentMethod "${paymentMethod}".` });
    }
    const invoiceDiscType = invoiceDiscountType || "flat";
    if (!VALID_DISCOUNT_TYPES.includes(invoiceDiscType)) {
      return res.status(400).json({ error: `Invalid invoiceDiscountType "${invoiceDiscountType}".` });
    }
    const invoiceDiscValue = invoiceDiscountValue || 0;
    if (!isFiniteNonNegative(invoiceDiscValue)) {
      return res.status(400).json({ error: "Invalid invoiceDiscountValue: must be a non-negative number." });
    }
    if (invoiceDiscType === "percent" && invoiceDiscValue > 100) {
      return res.status(400).json({ error: "Invalid invoiceDiscountValue: percent discount cannot exceed 100." });
    }
    for (const item of cart) {
      const err = validateCartItem(item);
      if (err) return res.status(400).json({ error: err });
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      return res.status(400).json({ error: "Missing required idempotencyKey." });
    }
    const existingTx = await Transaction_default.findOne({ idempotencyKey });
    if (existingTx) {
      return res.status(200).json({ success: true, id: existingTx._id, deduplicated: true });
    }
    const session = await import_mongoose15.default.startSession();
    const MAX_TRANSIENT_RETRIES = 3;
    let createdTxId = "";
    try {
      let attempt = 0;
      while (true) {
        attempt++;
        try {
          session.startTransaction({
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority" }
          });
          const dupInSession = await Transaction_default.findOne({ idempotencyKey }).session(session);
          if (dupInSession) {
            await session.abortTransaction();
            return res.status(200).json({ success: true, id: dupInSession._id, deduplicated: true });
          }
          let recalculatedSubtotal = 0;
          let itemDiscountsTotal = 0;
          const verifiedItems = [];
          const productItems = cart.filter((i) => i.type === "product");
          const serviceItems = cart.filter((i) => i.type === "service");
          const serviceDocs = await Service_default.find({
            _id: { $in: serviceItems.map((i) => i.id) }
          }).session(session);
          const serviceMap = new Map(serviceDocs.map((d) => [d._id, d]));
          const productDocs = await Product_default.find({
            _id: { $in: productItems.map((i) => i.id) }
          }).session(session);
          const productMap = new Map(productDocs.map((d) => [d._id, d]));
          const therapistUpdates = /* @__PURE__ */ new Map();
          for (const item of serviceItems) {
            const serviceData = serviceMap.get(item.id);
            if (!serviceData) {
              throw new Error(`Service ${item.id} not found.`);
            }
            const itemPrice = serviceData.price;
            const itemQty = item.quantity;
            const itemSubtotal = itemPrice * itemQty;
            recalculatedSubtotal += itemSubtotal;
            let itemDiscount = 0;
            const discVal = item.discountValue || 0;
            const discType = item.discountType || "flat";
            if (discType === "percent") {
              itemDiscount = itemPrice * itemQty * discVal / 100;
            } else {
              itemDiscount = Math.min(discVal * itemQty, itemSubtotal);
            }
            itemDiscountsTotal += itemDiscount;
            verifiedItems.push({
              id: item.id,
              name: serviceData.name,
              price: itemPrice,
              quantity: itemQty,
              type: "service",
              therapistId: item.therapistId,
              discountValue: item.discountValue || 0,
              discountType: item.discountType || "flat"
            });
            if (item.therapistId) {
              therapistUpdates.set(
                item.therapistId,
                (therapistUpdates.get(item.therapistId) || 0) + itemSubtotal
              );
            }
          }
          const productStockUpdates = [];
          for (const item of productItems) {
            const productData = productMap.get(item.id);
            if (!productData) {
              throw new Error(`Product ${item.id} not found in inventory.`);
            }
            if (productData.stock < item.quantity) {
              throw new Error(
                `Stok produk "${productData.name}" tidak mencukupi (Tersisa: ${productData.stock}, Diminta: ${item.quantity}).`
              );
            }
            const itemPrice = productData.price;
            const itemQty = item.quantity;
            const itemSubtotal = itemPrice * itemQty;
            recalculatedSubtotal += itemSubtotal;
            let itemDiscount = 0;
            const discVal = item.discountValue || 0;
            const discType = item.discountType || "flat";
            if (discType === "percent") {
              itemDiscount = itemPrice * itemQty * discVal / 100;
            } else {
              itemDiscount = Math.min(discVal * itemQty, itemSubtotal);
            }
            itemDiscountsTotal += itemDiscount;
            verifiedItems.push({
              id: item.id,
              name: productData.name,
              price: itemPrice,
              quantity: itemQty,
              type: "product",
              discountValue: item.discountValue || 0,
              discountType: item.discountType || "flat"
            });
            productStockUpdates.push({
              id: item.id,
              newStock: productData.stock - item.quantity
              // already validated >= 0 above
            });
          }
          const therapistDocs = await Therapist_default.find({
            _id: { $in: Array.from(therapistUpdates.keys()) }
          }).session(session);
          const therapistMap = new Map(therapistDocs.map((d) => [d._id, d]));
          let customerDoc = null;
          if (customerId) {
            customerDoc = await Customer_default.findById(customerId).session(session);
          } else if (customerName) {
            customerDoc = await Customer_default.findOne({ name: customerName }).session(session);
          }
          const intermediateSubtotal = Math.max(0, recalculatedSubtotal - itemDiscountsTotal);
          let invoiceDiscountAmount = 0;
          if (invoiceDiscType === "percent") {
            invoiceDiscountAmount = intermediateSubtotal * invoiceDiscValue / 100;
          } else {
            invoiceDiscountAmount = Math.min(invoiceDiscValue, intermediateSubtotal);
          }
          const totalDiscount = itemDiscountsTotal + invoiceDiscountAmount;
          const finalTotal = Math.max(0, recalculatedSubtotal - totalDiscount);
          for (const update of productStockUpdates) {
            await Product_default.updateOne(
              { _id: update.id },
              { $set: { stock: update.newStock } }
            ).session(session);
          }
          for (const [therapistId, serviceValue] of therapistUpdates.entries()) {
            const therData = therapistMap.get(therapistId);
            if (therData) {
              const commissionRate = therData.commissionRate || 0;
              const currentSales = therData.currentSales || 0;
              const totalCommissionEarned = therData.totalCommissionEarned || 0;
              const addedComm = Math.round(serviceValue * commissionRate);
              await Therapist_default.updateOne(
                { _id: therapistId },
                {
                  $set: {
                    currentSales: currentSales + serviceValue,
                    totalCommissionEarned: totalCommissionEarned + addedComm
                  }
                }
              ).session(session);
            }
          }
          if (customerDoc) {
            await Customer_default.updateOne(
              { _id: customerDoc._id },
              {
                $set: {
                  visitsCount: (customerDoc.visitsCount || 0) + 1,
                  totalSpend: (customerDoc.totalSpend || 0) + finalTotal,
                  lastVisit: (/* @__PURE__ */ new Date()).toISOString().substring(0, 10)
                }
              }
            ).session(session);
          }
          const txId = "TX-" + import_crypto2.default.randomUUID().split("-")[0].toUpperCase();
          const dateStr = (/* @__PURE__ */ new Date()).toISOString().substring(0, 19).replace("T", " ");
          await Transaction_default.create(
            [
              {
                _id: txId,
                customerName: customerDoc?.name || customerName || "",
                customerId: customerDoc?._id,
                branch,
                items: verifiedItems,
                subtotal: recalculatedSubtotal,
                discount: totalDiscount,
                total: finalTotal,
                paymentMethod,
                date: dateStr,
                cashierName: cashierName || caller.email,
                idempotencyKey
              }
            ],
            { session }
          );
          await session.commitTransaction();
          createdTxId = txId;
          break;
        } catch (err) {
          await session.abortTransaction().catch(() => {
          });
          if (err?.code === 11e3 && err?.keyPattern?.idempotencyKey) {
            const existing = await Transaction_default.findOne({ idempotencyKey });
            if (existing) {
              return res.status(200).json({ success: true, id: existing._id, deduplicated: true });
            }
          }
          const isTransient = typeof err?.hasErrorLabel === "function" && err.hasErrorLabel("TransientTransactionError");
          if (isTransient && attempt < MAX_TRANSIENT_RETRIES) {
            continue;
          }
          throw err;
        }
      }
      return res.status(200).json({ success: true, id: createdTxId });
    } finally {
      await session.endSession();
    }
  } catch (err) {
    if (err?.code === 11e3 && err?.keyPattern?.idempotencyKey) {
      const existing = await Transaction_default.findOne({ idempotencyKey: req.body?.idempotencyKey });
      if (existing) {
        return res.status(200).json({ success: true, id: existing._id, deduplicated: true });
      }
    }
    console.error("Error in processCheckout:", err);
    return res.status(500).json({ error: err.message || "Error processing checkout" });
  }
}

// server/controllers/attendanceController.ts
var import_crypto3 = __toESM(require("crypto"), 1);
async function clockInOut(req, res) {
  try {
    const { action, attendanceId, record } = req.body;
    const authHeader = req.headers.authorization;
    const caller = await verifyUserToken(authHeader);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
    }
    const userData = await User_default.findById(caller.uid);
    if (!userData) {
      return res.status(403).json({ error: "Forbidden: User profile not found." });
    }
    const isHkaManagement = userData.role === "HKA_MANAGEMENT";
    if (action === "clockIn") {
      if (!isHkaManagement && record.userId !== caller.uid) {
        return res.status(403).json({ error: "Forbidden: Anda hanya diperbolehkan clock in untuk diri sendiri." });
      }
      const attId = "att-" + Math.floor(Math.random() * 9e3 + 1e3) + "-" + import_crypto3.default.randomBytes(2).toString("hex");
      await Attendance_default.create({
        _id: attId,
        userId: record.userId,
        userName: record.userName,
        role: record.role,
        branch: record.branch,
        date: record.date,
        clockIn: record.clockIn,
        status: "active",
        notes: record.notes || ""
      });
      return res.status(200).json({ success: true, id: attId });
    } else if (action === "clockOut") {
      if (!attendanceId) {
        return res.status(400).json({ error: "Missing attendanceId parameter." });
      }
      const existingData = await Attendance_default.findById(attendanceId);
      if (!existingData) {
        return res.status(404).json({ error: "Attendance record not found." });
      }
      if (!isHkaManagement && existingData.userId !== caller.uid) {
        return res.status(403).json({ error: "Forbidden: Anda hanya diperbolehkan clock out untuk diri sendiri." });
      }
      const updateData = {
        clockOut: record.clockOut,
        status: "completed"
      };
      if (record.notes) {
        updateData.notes = record.notes;
      }
      await Attendance_default.updateOne({ _id: attendanceId }, { $set: updateData });
      return res.status(200).json({ success: true });
    } else {
      return res.status(400).json({ error: "Invalid action parameter." });
    }
  } catch (err) {
    console.error("Error in clockInOut:", err);
    return res.status(500).json({ error: err.message || "Error processing attendance" });
  }
}

// server/controllers/resetPasswordController.ts
var import_bcryptjs2 = __toESM(require("bcryptjs"), 1);
async function resetStaffPassword(req, res) {
  try {
    const { uid } = req.body;
    if (!uid) {
      return res.status(400).json({ error: "Missing required uid parameter." });
    }
    const authHeader = req.headers.authorization;
    const caller = await verifyUserToken(authHeader);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
    }
    const callerData = await User_default.findById(caller.uid);
    if (!callerData) {
      return res.status(403).json({ error: "Forbidden: User profile not found." });
    }
    if (callerData.role !== "HKA_MANAGEMENT") {
      return res.status(403).json({
        error: "Forbidden: Hanya HKA_MANAGEMENT yang diizinkan untuk menyetel ulang password."
      });
    }
    const targetUser = await User_default.findById(uid);
    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found." });
    }
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let tempPassword = "";
    for (let i = 0; i < 8; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const passwordHash = await import_bcryptjs2.default.hash(tempPassword, 10);
    await User_default.updateOne(
      { _id: uid },
      { $set: { passwordHash, forcePasswordChange: true } }
    );
    return res.status(200).json({ success: true, tempPassword });
  } catch (err) {
    console.error("Error in resetStaffPassword:", err);
    return res.status(500).json({ error: err.message || "Error resetting staff password." });
  }
}

// server/controllers/googleSheetsController.ts
async function syncSheetsToFirestore(req, res) {
  try {
    const { spreadsheetId, accessToken, appsScriptUrl } = req.body;
    if (!spreadsheetId) {
      return res.status(400).json({ error: "Missing required spreadsheetId parameter." });
    }
    const authHeader = req.headers.authorization;
    const caller = await verifyUserToken(authHeader);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
    }
    const userData = await User_default.findById(caller.uid);
    if (!userData || userData.role !== "HKA_MANAGEMENT") {
      return res.status(403).json({
        error: "Forbidden: Hanya HKA_MANAGEMENT yang diizinkan melakukan sinkronisasi payroll dari Google Sheets."
      });
    }
    let rows = [];
    if (appsScriptUrl) {
      const fetchRes = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", spreadsheetId })
      });
      if (!fetchRes.ok) {
        throw new Error(`Apps Script fetch failed with status ${fetchRes.status}`);
      }
      const json = await fetchRes.json();
      if (json.status !== "success") {
        throw new Error(json.message || "Apps Script failed to read");
      }
      rows = json.data?.["Therapists"] || [];
    } else {
      if (!accessToken) {
        return res.status(400).json({ error: "Missing Google access token." });
      }
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Therapists!A1:K`;
      const fetchRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!fetchRes.ok) {
        throw new Error(`Sheets API fetch failed with status ${fetchRes.status}`);
      }
      const json = await fetchRes.json();
      rows = json.values || [];
    }
    if (rows.length === 0) {
      return res.status(200).json({ success: true, warnings: [], lastPayrollSync: (/* @__PURE__ */ new Date()).toISOString() });
    }
    const headers = rows[0];
    const idIndex = headers.indexOf("id");
    const commissionRateIndex = headers.indexOf("commissionRate");
    const baseSalaryIndex = headers.indexOf("baseSalary");
    if (idIndex === -1) {
      return res.status(400).json({ error: "Kolom 'id' tidak ditemukan di tab Therapists pada Google Sheets." });
    }
    const therapistsToProcess = rows.slice(1);
    const warnings = [];
    const syncTimestamp = (/* @__PURE__ */ new Date()).toISOString();
    for (const row of therapistsToProcess) {
      const therapistId = row[idIndex];
      if (!therapistId) continue;
      const fsData = await Therapist_default.findById(therapistId);
      if (!fsData) continue;
      const therapistName = fsData.name || therapistId;
      let commissionRateChanged = false;
      let newCommissionRateValue = null;
      if (commissionRateIndex !== -1 && commissionRateIndex < row.length) {
        const rawComm = row[commissionRateIndex];
        if (rawComm !== void 0 && rawComm !== null && String(rawComm).trim() !== "") {
          const parsedComm = Number(rawComm);
          const currentComm = fsData.commissionRate !== void 0 ? Number(fsData.commissionRate) : null;
          if (parsedComm !== currentComm) {
            if (isNaN(parsedComm) || parsedComm < 0 || parsedComm > 1) {
              warnings.push(
                `Baris therapist ${therapistName} di Sheet memiliki nilai commissionRate tidak valid (${rawComm}) dan diabaikan`
              );
            } else {
              commissionRateChanged = true;
              newCommissionRateValue = parsedComm;
            }
          }
        }
      }
      let baseSalaryChanged = false;
      let newBaseSalaryValue = null;
      if (baseSalaryIndex !== -1 && baseSalaryIndex < row.length) {
        const rawSalary = row[baseSalaryIndex];
        if (rawSalary !== void 0 && rawSalary !== null && String(rawSalary).trim() !== "") {
          const parsedSalary = Number(rawSalary);
          const currentSalary = fsData.baseSalary !== void 0 ? Number(fsData.baseSalary) : null;
          if (parsedSalary !== currentSalary) {
            if (isNaN(parsedSalary) || parsedSalary < 0) {
              warnings.push(
                `Baris therapist ${therapistName} di Sheet memiliki nilai baseSalary tidak valid (${rawSalary}) dan diabaikan`
              );
            } else {
              baseSalaryChanged = true;
              newBaseSalaryValue = parsedSalary;
            }
          }
        }
      }
      if (commissionRateChanged || baseSalaryChanged) {
        const updateData = {};
        const auditLogsToWrite = [];
        if (commissionRateChanged && newCommissionRateValue !== null) {
          updateData.commissionRate = newCommissionRateValue;
          auditLogsToWrite.push({
            therapistId,
            field: "commissionRate",
            oldValue: fsData.commissionRate !== void 0 ? fsData.commissionRate : null,
            newValue: newCommissionRateValue,
            source: "google_sheets_sync",
            timestamp: syncTimestamp
          });
        }
        if (baseSalaryChanged && newBaseSalaryValue !== null) {
          updateData.baseSalary = newBaseSalaryValue;
          auditLogsToWrite.push({
            therapistId,
            field: "baseSalary",
            oldValue: fsData.baseSalary !== void 0 ? fsData.baseSalary : null,
            newValue: newBaseSalaryValue,
            source: "google_sheets_sync",
            timestamp: syncTimestamp
          });
        }
        await Therapist_default.updateOne({ _id: therapistId }, { $set: updateData });
        if (auditLogsToWrite.length > 0) {
          await PayrollAuditLog_default.insertMany(auditLogsToWrite);
        }
      }
    }
    await Setting_default.findByIdAndUpdate(
      "sheets_config",
      { $set: { lastPayrollSync: syncTimestamp } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(200).json({
      success: true,
      warnings,
      lastPayrollSync: syncTimestamp
    });
  } catch (err) {
    console.error("Error in syncSheetsToFirestore:", err);
    return res.status(500).json({ error: err.message || "Error during Sheets to Firestore sync." });
  }
}

// server/routes/businessRoutes.ts
var router3 = (0, import_express3.Router)();
router3.post("/processCheckout", validate({ body: checkoutBodySchema }), processCheckout);
router3.post("/clockInOut", validate({ body: clockInOutBodySchema }), clockInOut);
router3.post("/resetStaffPassword", resetStaffPassword);
router3.post("/syncSheetsToFirestore", syncSheetsToFirestore);
var businessRoutes_default = router3;

// server/routes/uploadRoutes.ts
var import_express4 = require("express");

// server/controllers/uploadController.ts
var import_crypto4 = __toESM(require("crypto"), 1);
async function uploadFile(req, res) {
  try {
    const path = req.params[0];
    const { contentType, dataBase64 } = req.body;
    if (!contentType || !dataBase64) {
      return res.status(400).json({ error: "Missing contentType or dataBase64." });
    }
    const id = import_crypto4.default.createHash("sha1").update(path).digest("hex");
    await Upload_default.findByIdAndUpdate(
      id,
      { _id: id, contentType, dataBase64, createdAt: /* @__PURE__ */ new Date() },
      { upsert: true }
    );
    return res.status(200).json({
      success: true,
      url: `/api/uploads/file/${id}`
    });
  } catch (err) {
    console.error("Error uploading file:", err);
    return res.status(500).json({ error: err.message || "Upload failed." });
  }
}
async function getFile(req, res) {
  try {
    const upload = await Upload_default.findById(req.params.id);
    if (!upload) {
      return res.status(404).send("Not found");
    }
    const buffer = Buffer.from(upload.dataBase64, "base64");
    res.setHeader("Content-Type", upload.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("Error fetching file:", err);
    return res.status(500).send("Failed to fetch file.");
  }
}

// server/routes/uploadRoutes.ts
var router4 = (0, import_express4.Router)();
router4.get("/file/:id", getFile);
router4.post("/*", requireAuth, uploadFile);
var uploadRoutes_default = router4;

// server/config/db.ts
var import_mongoose16 = __toESM(require("mongoose"), 1);
var isConnected = false;
async function connectToDatabase() {
  if (isConnected && import_mongoose16.default.connection.readyState === 1) {
    return import_mongoose16.default;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Please configure it in your environment (.env or Vercel project settings)."
    );
  }
  import_mongoose16.default.set("strictQuery", true);
  await import_mongoose16.default.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME || void 0
  });
  isConnected = true;
  import_mongoose16.default.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
  });
  import_mongoose16.default.connection.on("disconnected", () => {
    isConnected = false;
  });
  console.log("Connected to MongoDB Atlas");
  return import_mongoose16.default;
}

// server/app.ts
function createApp() {
  const app2 = (0, import_express5.default)();
  app2.use((0, import_cors.default)());
  app2.use(import_express5.default.json({ limit: "10mb" }));
  app2.use(async (req, res, next) => {
    try {
      await connectToDatabase();
      next();
    } catch (err) {
      console.error("Database connection error:", err);
      res.status(500).json({ error: "Database connection failed." });
    }
  });
  app2.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app2.use("/api/auth", authRoutes_default);
  app2.use("/api/data", dataRoutes_default);
  app2.use("/api/uploads", uploadRoutes_default);
  app2.use("/api", businessRoutes_default);
  return app2;
}

// server/vercelEntry.ts
var app = createApp();
var vercelEntry_default = app;
