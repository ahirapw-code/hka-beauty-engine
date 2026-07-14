import { Request, Response } from "express";
import crypto from "crypto";
import Upload from "../models/Upload";

/**
 * POST /api/uploads/:path
 * Body: { contentType, dataBase64 }
 * Equivalent to Firebase Storage's uploadBytes(ref(storage, path), file).
 * `:path` may contain slashes (e.g. "branchLogos/NAO_STUDIO.png"), captured
 * via the wildcard route below.
 */
export async function uploadFile(req: Request, res: Response) {
  try {
    const path = req.params[0];
    const { contentType, dataBase64 } = req.body;
    if (!contentType || !dataBase64) {
      return res.status(400).json({ error: "Missing contentType or dataBase64." });
    }

    const id = crypto.createHash("sha1").update(path).digest("hex");
    await Upload.findByIdAndUpdate(
      id,
      { _id: id, contentType, dataBase64, createdAt: new Date() },
      { upsert: true }
    );

    return res.status(200).json({
      success: true,
      url: `/api/uploads/file/${id}`,
    });
  } catch (err: any) {
    console.error("Error uploading file:", err);
    return res.status(500).json({ error: err.message || "Upload failed." });
  }
}

/**
 * GET /api/uploads/file/:id
 * Equivalent to Firebase Storage's getDownloadURL() - serves the stored
 * asset directly so it can be used as an <img src>.
 */
export async function getFile(req: Request, res: Response) {
  try {
    const upload = await Upload.findById(req.params.id);
    if (!upload) {
      return res.status(404).send("Not found");
    }
    const buffer = Buffer.from(upload.dataBase64, "base64");
    res.setHeader("Content-Type", upload.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error("Error fetching file:", err);
    return res.status(500).send("Failed to fetch file.");
  }
}
