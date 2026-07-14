import { Router } from "express";
import { processCheckout } from "../controllers/checkoutController";
import { clockInOut } from "../controllers/attendanceController";
import { resetStaffPassword } from "../controllers/resetPasswordController";
import { syncSheetsToFirestore } from "../controllers/googleSheetsController";
import { validate } from "../middleware/validate";
import { checkoutBodySchema, clockInOutBodySchema } from "../validation/schemas";

const router = Router();

// Endpoint paths are unchanged from the original Firebase-backed server.ts
router.post("/processCheckout", validate({ body: checkoutBodySchema }), processCheckout);
router.post("/clockInOut", validate({ body: clockInOutBodySchema }), clockInOut);
router.post("/resetStaffPassword", resetStaffPassword);
router.post("/syncSheetsToFirestore", syncSheetsToFirestore);

export default router;
