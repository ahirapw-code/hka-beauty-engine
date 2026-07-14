import "dotenv/config";
import { createApp } from "../server/app";

// Vercel treats this exported Express app as a serverless function handler.
// All requests to /api/* (see vercel.json) are routed here.
const app = createApp();

export default app;
