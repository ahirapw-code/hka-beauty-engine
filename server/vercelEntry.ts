import "dotenv/config";
import { createApp } from "./app.js";

// Vercel treats this exported Express app as a serverless function handler.
// This file is bundled (via esbuild, see package.json "build:api" script) into
// a single self-contained api/index.cjs — so there are no relative imports left
// for Vercel's function tracer to resolve at deploy time.
const app = createApp();

export default app;
