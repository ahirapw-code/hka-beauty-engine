import { Router } from "express";
import { processCheckout } from "../controllers/checkoutController.js";
import { clockInOut } from "../controllers/attendanceController.js";
import { resetStaffPassword } from "../controllers/resetPasswordController.js";
import { syncSheetsToFirestore, adjustTherapistCommission } from "../controllers/googleSheetsController.js";
import { persistSheetsSync } from "../controllers/sheetsPersistController.js";
import { createBooking, createExpense, createPayrollRun, updateBookingStatus, activateMembership, createTherapist, createCustomer } from "../controllers/recordsController.js";
import { requireAuthWithProfile } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { checkoutBodySchema, clockInOutBodySchema, bookingCreateSchema, bookingStatusUpdateSchema, therapistCreateSchema, therapistCommissionAdjustmentSchema, customerCreateSchema } from "../validation/schemas.js";

const router = Router();

router.post("/processCheckout", validate({ body: checkoutBodySchema }), processCheckout);
router.post("/clockInOut", validate({ body: clockInOutBodySchema }), clockInOut);
router.post("/resetStaffPassword", resetStaffPassword);
router.post("/syncSheetsToFirestore", syncSheetsToFirestore);

router.post("/bookings", validate({ body: bookingCreateSchema }), createBooking);
router.patch("/bookings/:id/status", validate({ body: bookingStatusUpdateSchema }), updateBookingStatus);
router.post("/customers", validate({ body: customerCreateSchema }), createCustomer);
router.patch("/customers/:id/membership", activateMembership);
router.post("/therapists", validate({ body: therapistCreateSchema }), createTherapist);
router.patch(
  "/therapists/:id/commission-adjustment",
  validate({ body: therapistCommissionAdjustmentSchema }),
  adjustTherapistCommission
);
router.post("/expenses", createExpense);
router.post("/payroll/run", createPayrollRun);

router.post("/sheets/persist", requireAuthWithProfile, persistSheetsSync);

export default router;
