import { Router } from "express";
import {
  listDocuments,
  getDocument,
  setDocument,
  updateDocument,
  deleteDocument,
  batchSetDocuments,
} from "../controllers/dataController";
import { requireAuthWithProfile } from "../middleware/auth";
import { authorizeCollectionAccess } from "../middleware/authorize";
import {
  validateDataIdParam,
  validateDataListQuery,
  validateDataCreateBody,
  validateDataUpdateBody,
  validateDataBatchBody,
} from "../middleware/validateDataCollection";

const router = Router({ mergeParams: true });

// All data access requires a logged-in user with a known role (fixes the
// critical gap where any valid token could read/write any collection).
router.use(requireAuthWithProfile);

// Validation runs AFTER authorization (so an unauthorized caller gets 403
// before any 400 about payload shape) and only adds a schema check for
// "customers", "bookings", "products", "services" -- every other collection
// keeps behaving exactly as before.
router.get("/:collection", authorizeCollectionAccess("read"), validateDataListQuery, listDocuments);
router.get("/:collection/:id", authorizeCollectionAccess("read"), validateDataIdParam, getDocument);

router.post(
  "/:collection/_batch",
  authorizeCollectionAccess("write"),
  validateDataBatchBody,
  batchSetDocuments
);
router.put(
  "/:collection/:id",
  authorizeCollectionAccess("write"),
  validateDataIdParam,
  validateDataCreateBody,
  setDocument
);
router.patch(
  "/:collection/:id",
  authorizeCollectionAccess("write"),
  validateDataIdParam,
  validateDataUpdateBody,
  updateDocument
);
router.delete("/:collection/:id", authorizeCollectionAccess("write"), validateDataIdParam, deleteDocument);

export default router;
