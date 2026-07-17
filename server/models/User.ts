import mongoose, { type Document } from "mongoose";
const { Schema, model, models } = mongoose;
import { baseSchemaOptions, withId } from "./baseSchema.js";

export interface IUser extends Document<string> {
  _id: string;
  username: string;
  name: string;
  role: "HKA_MANAGEMENT" | "SALON_MANAGER" | "THERAPIST";
  branch: "NAO_STUDIO" | "DIAEL_BEAUTY" | "ALL";
  email: string;
  passwordHash: string;
  avatar?: string;
  forcePasswordChange?: boolean;
  // Payroll rate fields, meaningful only for SALON_MANAGER accounts.
  // Mirrors Therapist.commissionRate/baseSalary - set via the same
  // audited, HKA_MANAGEMENT-only Google Sheets payroll sync
  // (see server/controllers/googleSheetsController.ts, "Managers" tab),
  // never through the generic /api/data/users write path.
  commissionRate?: number;
  baseSalary?: number;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true },
    name: { type: String, required: true },
    role: {
      type: String,
      enum: ["HKA_MANAGEMENT", "SALON_MANAGER", "THERAPIST"],
      required: true,
    },
    branch: {
      type: String,
      enum: ["NAO_STUDIO", "DIAEL_BEAUTY", "ALL"],
      required: true,
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String },
    forcePasswordChange: { type: Boolean, default: false },
    commissionRate: { type: Number, default: 0 },
    baseSalary: { type: Number, default: 0 },
  },
  baseSchemaOptions
);

withId(UserSchema);

// Never leak the password hash to the client even if select() isn't used explicitly.
UserSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret: any) => {
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

export default models.User || model<IUser>("User", UserSchema, "users");
