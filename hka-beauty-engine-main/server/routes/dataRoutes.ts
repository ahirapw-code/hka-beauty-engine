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

const router = Router({ mergeParams: true });

// All data access requires a logged-in user with a known role (fixes the
// critical gap where any valid token could read/write any collection).
router.use(requireAuthWithProfile);

router.get("/:collection", authorizeCollectionAccess("read"), listDocuments);
router.get("/:collection/:id", authorizeCollectionAccess("read"), getDocument);

router.post("/:collection/_batch", authorizeCollectionAccess("write"), batchSetDocuments);
router.put("/:collection/:id", authorizeCollectionAccess("write"), setDocument);
router.patch("/:collection/:id", authorizeCollectionAccess("write"), updateDocument);
router.delete("/:collection/:id", authorizeCollectionAccess("write"), deleteDocument);

export default router;
