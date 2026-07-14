import { Router } from "express";
import { register, login, me, changePassword } from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { loginBodySchema } from "../validation/schemas";

const router = Router();

router.post("/register", register);
router.post("/login", validate({ body: loginBodySchema }), login);
router.get("/me", requireAuth, me);
router.post("/change-password", requireAuth, changePassword);

export default router;
