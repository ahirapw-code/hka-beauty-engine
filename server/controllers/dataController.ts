import { Request, Response } from "express";
import { collectionRegistry } from "../models";

function getModel(req: Request, res: Response) {
  const { collection } = req.params;
  const model = collectionRegistry[collection];
  if (!model) {
    res.status(404).json({ error: `Unknown collection "${collection}".` });
    return null;
  }
  return model;
}

/**
 * Parses repeated `where=field,op,value` query params into a Mongo filter.
 * Supports the same operators the frontend used via Firestore's `where()`:
 * ==, !=, <, <=, >, >=
 */
function buildFilter(whereParams: string | string[] | undefined): Record<string, any> {
  if (!whereParams) return {};
  const clauses = Array.isArray(whereParams) ? whereParams : [whereParams];
  const filter: Record<string, any> = {};

  for (const clause of clauses) {
    const [field, op, ...rest] = String(clause).split(",");
    if (!field || !op) continue;
    let value: any = rest.join(",");

    // Coerce numeric/boolean-looking values
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else if (value !== "" && !isNaN(Number(value))) value = Number(value);

    switch (op) {
      case "==":
        filter[field] = value;
        break;
      case "!=":
        filter[field] = { ...(filter[field] || {}), $ne: value };
        break;
      case "<":
        filter[field] = { ...(filter[field] || {}), $lt: value };
        break;
      case "<=":
        filter[field] = { ...(filter[field] || {}), $lte: value };
        break;
      case ">":
        filter[field] = { ...(filter[field] || {}), $gt: value };
        break;
      case ">=":
        filter[field] = { ...(filter[field] || {}), $gte: value };
        break;
      default:
        break;
    }
  }
  return filter;
}

/**
 * GET /api/data/:collection?where=field,op,value&orderBy=field,dir
 * Equivalent to Firestore's getDocs(query(collection(db, name), where(...), orderBy(...)))
 */
export async function listDocuments(req: Request, res: Response) {
  const model = getModel(req, res);
  if (!model) return;

  try {
    const filter = buildFilter(req.query.where as any);
    let cursor = model.find(filter);

    if (req.query.orderBy) {
      const [field, direction] = String(req.query.orderBy).split(",");
      cursor = cursor.sort({ [field]: direction === "desc" ? -1 : 1 });
    }
    if (req.query.limit) {
      cursor = cursor.limit(Number(req.query.limit));
    }

    const docs = await cursor.exec();
    return res.status(200).json({ docs: docs.map((d) => d.toJSON()) });
  } catch (err: any) {
    console.error(`Error listing ${req.params.collection}:`, err);
    return res.status(500).json({ error: err.message || "Failed to list documents." });
  }
}

/**
 * GET /api/data/:collection/:id
 * Equivalent to Firestore's getDoc(doc(db, name, id))
 */
export async function getDocument(req: Request, res: Response) {
  const model = getModel(req, res);
  if (!model) return;

  try {
    const doc = await model.findById(req.params.id);
    if (!doc) {
      return res.status(200).json({ exists: false, data: null });
    }
    return res.status(200).json({ exists: true, data: doc.toJSON() });
  } catch (err: any) {
    console.error(`Error getting ${req.params.collection}/${req.params.id}:`, err);
    return res.status(500).json({ error: err.message || "Failed to get document." });
  }
}

/**
 * PUT /api/data/:collection/:id
 * Equivalent to Firestore's setDoc(doc(db, name, id), data, { merge })
 */
export async function setDocument(req: Request, res: Response) {
  const model = getModel(req, res);
  if (!model) return;

  try {
    const merge = req.query.merge === "true";
    const payload = { ...req.body, _id: req.params.id };
    delete payload.id;

    if (merge) {
      const updated = await model.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return res.status(200).json({ success: true, data: updated.toJSON() });
    }

    const doc = await model.findOneAndReplace({ _id: req.params.id }, payload, {
      upsert: true,
      new: true,
    });
    return res.status(200).json({ success: true, data: doc.toJSON() });
  } catch (err: any) {
    console.error(`Error setting ${req.params.collection}/${req.params.id}:`, err);
    return res.status(500).json({ error: err.message || "Failed to save document." });
  }
}

/**
 * PATCH /api/data/:collection/:id
 * Equivalent to Firestore's updateDoc(doc(db, name, id), data)
 */
export async function updateDocument(req: Request, res: Response) {
  const model = getModel(req, res);
  if (!model) return;

  try {
    const updated = await model.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: "Document not found." });
    }
    return res.status(200).json({ success: true, data: updated.toJSON() });
  } catch (err: any) {
    console.error(`Error updating ${req.params.collection}/${req.params.id}:`, err);
    return res.status(500).json({ error: err.message || "Failed to update document." });
  }
}

/**
 * DELETE /api/data/:collection/:id
 * Equivalent to Firestore's deleteDoc(doc(db, name, id))
 */
export async function deleteDocument(req: Request, res: Response) {
  const model = getModel(req, res);
  if (!model) return;

  try {
    await model.deleteOne({ _id: req.params.id });
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error(`Error deleting ${req.params.collection}/${req.params.id}:`, err);
    return res.status(500).json({ error: err.message || "Failed to delete document." });
  }
}

/**
 * POST /api/data/:collection/_batch
 * Equivalent to Firestore's writeBatch(db) used for initial DB seeding.
 * Body: { docs: [{ id, data }, ...] }
 * Only inserts documents that don't already exist, mirroring the original
 * "seed if empty" behavior (checked collection-by-collection on the client).
 */
export async function batchSetDocuments(req: Request, res: Response) {
  const model = getModel(req, res);
  if (!model) return;

  try {
    const { docs } = req.body as { docs: { id: string; data: any }[] };
    if (!Array.isArray(docs)) {
      return res.status(400).json({ error: "Body must include a `docs` array." });
    }

    const existingCount = await model.estimatedDocumentCount();
    if (existingCount > 0) {
      return res.status(200).json({ success: true, inserted: 0, skipped: docs.length });
    }

    const toInsert = docs.map((d) => ({ ...d.data, _id: d.id }));
    if (toInsert.length > 0) {
      await model.insertMany(toInsert, { ordered: false });
    }
    return res.status(200).json({ success: true, inserted: toInsert.length });
  } catch (err: any) {
    console.error(`Error batch-seeding ${req.params.collection}:`, err);
    return res.status(500).json({ error: err.message || "Failed to seed documents." });
  }
}
