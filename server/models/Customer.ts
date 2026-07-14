import { Schema, model, models, Document } from "mongoose";
import { baseSchemaOptions, withId } from "./baseSchema.js";

export interface ICustomer extends Document<string> {
  _id: string;
  name: string;
  email: string;
  phone: string;
  totalSpend: number;
  visitsCount: number;
  lastVisit?: string;
  notes?: string;
  preferredBranch: "NAO_STUDIO" | "DIAEL_BEAUTY";
}

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    totalSpend: { type: Number, default: 0 },
    visitsCount: { type: Number, default: 0 },
    lastVisit: { type: String },
    notes: { type: String },
    preferredBranch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
  },
  baseSchemaOptions
);

withId(CustomerSchema);

export default models.Customer || model<ICustomer>("Customer", CustomerSchema, "customers");
