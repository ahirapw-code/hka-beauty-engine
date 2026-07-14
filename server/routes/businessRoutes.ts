import { Router } from "express";
import { processCheckout } from "../controllers/checkoutController.js";
import { clockInOut } from "../controllers/attendanceController.js";
import { resetStaffPassword } from "../controllers/resetPasswordController.js";
import { syncSheetsToFirestore } from "../controllers/googleSheetsController.js";
import { persistSheetsSync } from "../controllers/sheetsPersistController.js";
import { createBooking, createExpense, createPayrollRun } from "../controllers/recordsController.js";
import { requireAuthWithProfile } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { checkoutBodySchema, clockInOutBodySchema, bookingCreateSchema } from "../validation/schemas.js";

const router = Router();

router.post("/processCheckout", validate({ body: checkoutBodySchema }), processCheckout);
router.post("/clockInOut", validate({ body: clockInOutBodySchema }), clockInOut);
router.post("/resetStaffPassword", resetStaffPassword);
router.post("/syncSheetsToFirestore", syncSheetsToFirestore);

router.post("/bookings", validate({ body: bookingCreateSchema }), createBooking);
router.post("/expenses", createExpense);
router.post("/payroll/run", createPayrollRun);

router.post("/sheets/persist", requireAuthWithProfile, persistSheetsSync);

export default router;
