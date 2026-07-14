import { Router } from "express";
import { processCheckout } from "../controllers/checkoutController.js";
import { clockInOut } from "../controllers/attendanceController.js";
import { resetStaffPassword } from "../controllers/resetPasswordController.js";
import { syncSheetsToFirestore } from "../controllers/googleSheetsController.js";
import { validate } from "../middleware/validate.js";
import { checkoutBodySchema, clockInOutBodySchema } from "../validation/schemas.js";

const router = Router();

// Endpoint paths are unchanged from the original Firebase-backed server.ts
router.post("/processCheckout", validate({ body: checkoutBodySchema }), processCheckout);
router.post("/clockInOut", validate({ body: clockInOutBodySchema }), clockInOut);
router.post("/resetStaffPassword", resetStaffPassword);
router.post("/syncSheetsToFirestore", syncSheetsToFirestore);

export default router;
