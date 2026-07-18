import { Request, Response, NextFunction } from "express";

type Role = "HKA_MANAGEMENT" | "SALON_MANAGER" | "THERAPIST";

const MANAGEMENT: Role[] = ["HKA_MANAGEMENT", "SALON_MANAGER"];
const ALL_ROLES: Role[] = ["HKA_MANAGEMENT", "SALON_MANAGER", "THERAPIST"];

/**
 * Fields that must NEVER be modifiable through the generic CRUD API, even by
 * an otherwise-permitted writer, because they control access/pay and must
 * only change through dedicated, audited flows (register/reset-password
 * controllers, checkout/payroll-run logic, etc).
 */
const PROTECTED_FIELDS: Record<string, string[]> = {
  users: ["role", "branch", "passwordHash", "email", "forcePasswordChange"],
  therapists: ["currentSales", "totalCommissionEarned"],
};

/**
 * Collections whose real writes must only ever happen through a dedicated,
 * business-logic-aware controller (processCheckout, clockInOut, payroll
 * finalization, etc). We block generic writes entirely, even for
 * HKA_MANAGEMENT, to prevent the accounting/audit trail from being
 * bypassed. Use a dedicated admin tool/script for manual corrections.
 */
const WRITE_LOCKED_COLLECTIONS = new Set([
  "transactions",
  "attendance",
  "bookings",
  "customers",
  "therapists",
  "products",
  "services",
  "expenses",
  "payroll",
  "settings",
]);

/**
 * Narrow exemptions inside otherwise write-locked collections, for
 * app-internal config unrelated to business data (e.g. the sync feature
 * needs somewhere to store its own spreadsheet id / Apps Script URL before
 * any sync has ever run).
 *
 * branchProfile_NAO_STUDIO / branchProfile_DIAEL_BEAUTY (src/components/
 * BranchSettings.tsx, read by src/components/POS.tsx for invoice printing)
 * belong here too: they're branch metadata (logo, address, phone, bank
 * info, invoice footer note) that has no corresponding Google Sheets tab
 * and was never meant to be "managed through Google Sheets" - unlike the
 * business-data collections this write-lock exists to protect, there's no
 * accounting/audit trail to bypass here. Without this exemption the write
 * was silently 403'd for every role, including HKA_MANAGEMENT, and
 * BranchSettings.tsx's catch-all error handler then showed a misleading
 * "Pastikan Anda memiliki hak akses HKA_MANAGEMENT" message that made it
 * look like a permissions problem rather than a missing exemption.
 */
const WRITE_LOCK_EXEMPT_DOC_IDS: Record<string, Set<string>> = {
  settings: new Set(["sheets_config", "seed_status", "branchProfile_NAO_STUDIO", "branchProfile_DIAEL_BEAUTY"]),
};

interface CollectionPolicy {
  read: Role[] | "all";
  write: Role[] | "all";
  /** If true, a non-management caller may only touch the document whose _id equals their own uid. */
  selfScopedFor?: Role[];
  /** Field used to scope "list" reads/writes to the caller's own records (e.g. staffId, userId). */
  ownerField?: string;
}

const POLICIES: Record<string, CollectionPolicy> = {
  customers: { read: "all", write: MANAGEMENT },
  therapists: { read: "all", write: MANAGEMENT },
  products: { read: "all", write: MANAGEMENT },
  services: { read: "all", write: MANAGEMENT },
  transactions: { read: "all", write: ["HKA_MANAGEMENT"] }, // write-locked below anyway
  attendance: {
    read: "all",
    write: ["HKA_MANAGEMENT"], // write-locked below anyway; corrections only
    selfScopedFor: ["THERAPIST", "SALON_MANAGER"],
    ownerField: "userId",
  },
  bookings: { read: "all", write: ALL_ROLES },
  expenses: { read: MANAGEMENT, write: MANAGEMENT },
  payroll: {
    read: "all",
    write: MANAGEMENT,
    selfScopedFor: ["THERAPIST"],
    ownerField: "staffId",
  },
  settings: { read: "all", write: MANAGEMENT },
  users: {
    read: "all",
    write: MANAGEMENT,
    selfScopedFor: ["THERAPIST"],
    ownerField: "_id",
  },
};

function roleAllows(list: Role[] | "all", role: Role): boolean {
  return list === "all" || list.includes(role);
}

/**
 * Middleware factory: enforces read/write role permissions and strips
 * protected fields from write payloads. Must run after requireAuthWithProfile
 * (needs req.auth.role).
 */
export function authorizeCollectionAccess(action: "read" | "write") {
  return (req: Request, res: Response, next: NextFunction) => {
    const collection = req.params.collection;
    const role = req.auth?.role as Role | undefined;

    if (!role) {
      return res.status(403).json({ error: "Forbidden: user role could not be determined." });
    }

    const policy = POLICIES[collection];
    if (!policy) {
      // Unknown collection - dataController.getModel() will 404 it anyway,
      // but default-deny here rather than falling through.
      return res.status(404).json({ error: `Unknown collection "${collection}".` });
    }

    if (action === "write") {
      // The one-time seed route (`/:collection/_batch`) is exempt from the
      // write-lock below: it can only ever insert when the collection is
      // still completely empty (checked in batchSetDocuments) and is now
      // additionally gated by a persistent settings/seed_status flag on the
      // client, so it can never be used to bulk-overwrite real data.
      const isBatchSeedRoute = req.path.endsWith("/_batch");

      // Real-world writes to these collections must go through their
      // dedicated, transactional, audited endpoints - never the generic API.
      if (WRITE_LOCKED_COLLECTIONS.has(collection) && !isBatchSeedRoute) {
        const exemptIds = WRITE_LOCK_EXEMPT_DOC_IDS[collection];
        const isExempt = exemptIds && req.params.id && exemptIds.has(req.params.id);
        if (!isExempt) {
          return res.status(403).json({
            error:
              `Forbidden: "${collection}" is managed through Google Sheets and can no longer be edited directly in the app. ` +
              `Update the record in the connected spreadsheet instead - changes sync automatically. ` +
              `(New records from checkout / clock in-out / bookings / expenses are still created by the app and pushed to the sheet.)`,
          });
        }
      }

      const isSelfScoped = policy.selfScopedFor?.includes(role);
      const isManagementWriter = roleAllows(policy.write, role);

      if (!isManagementWriter && !isSelfScoped) {
        return res.status(403).json({
          error: `Forbidden: your role (${role}) may not modify "${collection}".`,
        });
      }

      // If writing under self-scope (not full management access), the
      // target document/owner field MUST match the caller, and protected
      // fields must be stripped even if present in the payload.
      if (!isManagementWriter && isSelfScoped) {
        const targetId = req.params.id;
        const ownerField = policy.ownerField || "_id";
        if (ownerField === "_id") {
          if (targetId !== req.auth!.uid) {
            return res.status(403).json({
              error: "Forbidden: you may only modify your own record.",
            });
          }
        } else if (req.body && typeof req.body === "object") {
          // For payroll/attendance-style records, block attempts to write a
          // record that isn't attributed to the caller.
          const bodyOwner = req.body[ownerField];
          if (bodyOwner !== undefined && bodyOwner !== req.auth!.uid) {
            return res.status(403).json({
              error: "Forbidden: you may only modify your own records.",
            });
          }
        }
      }

      // Strip protected fields from the write payload regardless of who's
      // writing, unless the caller is HKA_MANAGEMENT (the one role allowed
      // to change role/branch/etc, e.g. promoting staff).
      const protectedFields = PROTECTED_FIELDS[collection];
      if (protectedFields && role !== "HKA_MANAGEMENT" && req.body && typeof req.body === "object") {
        for (const field of protectedFields) {
          if (field in req.body) delete req.body[field];
        }
      }
    } else {
      // action === 'read'
      if (!roleAllows(policy.read, role)) {
        return res.status(403).json({
          error: `Forbidden: your role (${role}) may not view "${collection}".`,
        });
      }

      // Self-scoped readers (e.g. a therapist reading payroll/attendance/
      // their own user doc) get their query forced to their own records so
      // they can't page through everyone else's data by omitting/forging
      // `where` filters. Management roles always get full visibility.
      const isManagementReader = MANAGEMENT.includes(role);

      if (!isManagementReader && policy.selfScopedFor?.includes(role)) {
        const ownerField = policy.ownerField || "_id";
        if (req.params.id) {
          if (ownerField === "_id" && req.params.id !== req.auth!.uid) {
            return res.status(403).json({ error: "Forbidden: you may only view your own record." });
          }
        } else {
          // List endpoint: force-inject an owner filter, discarding any
          // client-supplied `where` on the owner field to prevent spoofing.
          const existing = ([] as string[]).concat(req.query.where as any || []);
          const filtered = existing.filter((w) => !String(w).startsWith(`${ownerField},`));
          filtered.push(`${ownerField},==,${req.auth!.uid}`);
          req.query.where = filtered;
        }
      }
    }

    next();
  };
}
