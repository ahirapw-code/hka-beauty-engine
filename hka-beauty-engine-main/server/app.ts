import express, { Express } from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import dataRoutes from "./routes/dataRoutes";
import businessRoutes from "./routes/businessRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import { connectToDatabase } from "./config/db";

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // Ensure the DB connection is established before handling any API request.
  app.use(async (req, res, next) => {
    try {
      await connectToDatabase();
      next();
    } catch (err: any) {
      console.error("Database connection error:", err);
      res.status(500).json({ error: "Database connection failed." });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // JWT authentication routes (replaces Firebase Auth)
  app.use("/api/auth", authRoutes);

  // Generic collection CRUD (replaces direct Firestore client SDK access)
  app.use("/api/data", dataRoutes);

  // File uploads (replaces Firebase Storage for small assets like logos)
  app.use("/api/uploads", uploadRoutes);

  // Original custom business endpoints, paths unchanged
  app.use("/api", businessRoutes);

  return app;
}

export default createApp;
