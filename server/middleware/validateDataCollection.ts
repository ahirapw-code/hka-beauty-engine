import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  COLLECTION_BODY_SCHEMAS,
  dataListQuerySchema,
  batchSeedBodySchema,
  idParamSchema,
} from "../validation/schemas.js";

/**
 * The generic /api/data/:collection router serves ~10 different Mongo
 * collections. This validation pass is scoped to only the collections
 * explicitly requested (customers, bookings, products, services) -- any
 * other collection (therapists, expenses, payroll, settings, users,
 * transactions, attendance) passes straight through with NO added
 * validation, exactly as it behaved before, to avoid touching
 * business logic outside the requested scope.
 */
const IN_SCOPE_COLLECTIONS = new Set(["customers", "bookings", "products", "services"]);

function formatZodError(err: ZodError): string {
  return err.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}

function respondInvalid(res: Response, err: unknown) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: `Validation failed: ${formatZodError(err)}` });
  }
  return res.status(400).json({ error: "Validation failed: invalid request." });
}

/** Validates :id on /api/data/:collection/:id routes, in-scope collections only. */
export function validateDataIdParam(req: Request, res: Response, next: NextFunction) {
  if (!IN_SCOPE_COLLECTIONS.has(req.params.collection)) return next();
  try {
    req.params = { ...req.params, ...idParamSchema.parse(req.params) };
    next();
  } catch (err) {
    respondInvalid(res, err);
  }
}

/** Validates ?where=/&orderBy=/&limit= on GET /api/data/:collection (list), in-scope collections only. */
export function validateDataListQuery(req: Request, res: Response, next: NextFunction) {
  if (!IN_SCOPE_COLLECTIONS.has(req.params.collection)) return next();
  try {
    const parsed = dataListQuerySchema.parse(req.query);
    // Re-flatten back into the shape buildFilter() expects (string | string[]).
    (req.query as any).where = parsed.where;
    if (parsed.orderBy !== undefined) (req.query as any).orderBy = parsed.orderBy;
    if (parsed.limit !== undefined) (req.query as any).limit = String(parsed.limit);
    next();
  } catch (err) {
    respondInvalid(res, err);
  }
}

/** Validates the body of PUT /api/data/:collection/:id (create/replace), in-scope collections only. */
export function validateDataCreateBody(req: Request, res: Response, next: NextFunction) {
  const schemaPair = COLLECTION_BODY_SCHEMAS[req.params.collection];
  if (!schemaPair) return next(); // out of scope for this validation pass
  try {
    // `merge=true` (PATCH-via-PUT semantics in the original setDocument) is
    // treated the same as a partial update; a real replace uses the full
    // create schema so required fields can't be silently dropped.
    const isMerge = req.query.merge === "true";
    req.body = (isMerge ? schemaPair.update : schemaPair.create).parse(req.body);
    next();
  } catch (err) {
    respondInvalid(res, err);
  }
}

/** Validates the body of PATCH /api/data/:collection/:id (partial update), in-scope collections only. */
export function validateDataUpdateBody(req: Request, res: Response, next: NextFunction) {
  const schemaPair = COLLECTION_BODY_SCHEMAS[req.params.collection];
  if (!schemaPair) return next();
  try {
    req.body = schemaPair.update.parse(req.body);
    next();
  } catch (err) {
    respondInvalid(res, err);
  }
}

/** Validates the envelope of POST /api/data/:collection/_batch, in-scope collections only. */
export function validateDataBatchBody(req: Request, res: Response, next: NextFunction) {
  if (!IN_SCOPE_COLLECTIONS.has(req.params.collection)) return next();
  try {
    req.body = batchSeedBodySchema.parse(req.body);
    next();
  } catch (err) {
    respondInvalid(res, err);
  }
}
