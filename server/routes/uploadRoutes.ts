import { Router } from "express";
import { uploadFile, getFile } from "../controllers/uploadController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/file/:id", getFile); // public read, mirrors public download URLs from Firebase Storage
router.post("/*", requireAuth, uploadFile);

export default router;
