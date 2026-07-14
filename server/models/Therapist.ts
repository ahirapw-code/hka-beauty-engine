import { Schema, model, models, Document } from "mongoose";
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
  },
  baseSchemaOptions
);

withId(TherapistSchema);

export default models.Therapist || model<ITherapist>("Therapist", TherapistSchema, "therapists");
