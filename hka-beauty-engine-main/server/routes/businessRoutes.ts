import { Router } from "express";
import { processCheckout } from "../controllers/checkoutController";
import { clockInOut } from "../controllers/attendanceController";
import { resetStaffPassword } from "../controllers/resetPasswordController";
import { syncSheetsToFirestore } from "../controllers/googleSheetsController";

const router = Router();

// Endpoint paths are unchanged from the original Firebase-backed server.ts
router.post("/processCheckout", processCheckout);
router.post("/clockInOut", clockInOut);
router.post("/resetStaffPassword", resetStaffPassword);
router.post("/syncSheetsToFirestore", syncSheetsToFirestore);

export default router;
