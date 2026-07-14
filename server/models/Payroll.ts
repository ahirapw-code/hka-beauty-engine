import { Schema, model, models, Document } from "mongoose";
import { baseSchemaOptions, withId } from "./baseSchema";

export interface IPayroll extends Document<string> {
  _id: string;
  staffId: string;
  staffName: string;
  staffType: "therapist" | "manager";
  branch: "NAO_STUDIO" | "DIAEL_BEAUTY";
  periodMonth: string;
  baseSalary: number;
  commissionEarned: number;
  daysPresent: number;
  bonus: number;
  deductions: number;
  netPay: number;
  status: "draft" | "finalized" | "paid";
  generatedAt: string;
  generatedBy: string;
}

const PayrollSchema = new Schema<IPayroll>(
  {
    staffId: { type: String, required: true },
    staffName: { type: String, required: true },
    staffType: { type: String, enum: ["therapist", "manager"], required: true },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    periodMonth: { type: String, required: true },
    baseSalary: { type: Number, default: 0 },
    commissionEarned: { type: Number, default: 0 },
    daysPresent: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 },
    status: { type: String, enum: ["draft", "finalized", "paid"], default: "draft" },
    generatedAt: { type: String, required: true },
    generatedBy: { type: String, default: "" },
  },
  baseSchemaOptions
);

withId(PayrollSchema);

export default models.Payroll || model<IPayroll>("Payroll", PayrollSchema, "payroll");
