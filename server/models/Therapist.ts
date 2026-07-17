import mongoose, { type Document } from "mongoose";
const { Schema, model, models } = mongoose;
import { baseSchemaOptions, withId } from "./baseSchema.js";

export interface ITherapist extends Document<string> {
  _id: string;
  name: string;
  branch: "NAO_STUDIO" | "DIAEL_BEAUTY";
  specialties: string[];
  rating: number;
  commissionRate: number;
  totalCommissionEarned: number;
  status: "active" | "inactive";
  monthlyTarget: number;
  currentSales: number;
  baseSalary: number;
  // Set when this Therapist record represents the "therapist hat" of a
  // dual-role Salon Manager (e.g. a manager who sometimes performs
  // services themselves). Holds that manager's User _id. Left empty for
  // every ordinary, single-role therapist. Not payroll-sensitive on its
  // own, so unlike commissionRate/baseSalary it's a normal field synced
  // through the regular bidirectional "Therapists" Google Sheet tab.
  linkedUserId?: string;
}

const TherapistSchema = new Schema<ITherapist>(
  {
    name: { type: String, required: true },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    specialties: { type: [String], default: [] },
    rating: { type: Number, default: 0 },
    commissionRate: { type: Number, default: 0 },
    totalCommissionEarned: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    monthlyTarget: { type: Number, default: 0 },
    currentSales: { type: Number, default: 0 },
    baseSalary: { type: Number, default: 0 },
    linkedUserId: { type: String },
  },
  baseSchemaOptions
);

withId(TherapistSchema);

export default models.Therapist || model<ITherapist>("Therapist", TherapistSchema, "therapists");
