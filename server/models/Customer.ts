import mongoose, { type Document } from "mongoose";
const { Schema, model, models } = mongoose;
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
  // Membership marker: once true, this customer auto-qualifies for the 5%
  // membership discount at checkout (see checkoutController.ts). Tier
  // (Basic/Silver/Gold/Platinum) is intentionally NOT stored here - it is
  // derived purely from visitsCount on the frontend (see src/utils.ts
  // getMembershipTier) so it always stays in sync with actual visits and
  // never needs a separate migration/backfill.
  isMember?: boolean;
  memberSince?: string; // YYYY-MM-DD, set once when membership is activated
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
    isMember: { type: Boolean, default: false },
    memberSince: { type: String },
  },
  baseSchemaOptions
);

withId(CustomerSchema);

export default models.Customer || model<ICustomer>("Customer", CustomerSchema, "customers");
