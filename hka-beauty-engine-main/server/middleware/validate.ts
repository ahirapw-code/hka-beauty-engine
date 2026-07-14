import { Request, Response, NextFunction } from "express";
import { ZodTypeAny, ZodError } from "zod";

interface ValidationTargets {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

function formatZodError(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

/**
 * Express middleware factory: validates req.body / req.params / req.query
 * against the given Zod schemas, in that order, BEFORE the route's
 * controller runs. On failure, responds 400 with a clear, human-readable
 * message and never calls next() (so the controller never executes with
 * invalid input). On success, replaces req.body/params/query with the
 * parsed (type-coerced, defaulted) value so controllers see clean data.
 *
 * This only adds a rejection path for requests that were already invalid --
 * it does not change how valid requests are handled, so the API contract for
 * well-formed requests is unchanged.
 */
export function validate(targets: ValidationTargets) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (targets.body) {
        req.body = targets.body.parse(req.body);
      }
      if (targets.params) {
        req.params = targets.params.parse(req.params) as any;
      }
      if (targets.query) {
        req.query = targets.query.parse(req.query) as any;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: `Validation failed: ${formatZodError(err)}` });
      }
      return res.status(400).json({ error: "Validation failed: invalid request." });
    }
  };
}
