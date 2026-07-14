import mongoose, { type Document } from "mongoose";
const { Schema, model, models } = mongoose;
import { baseSchemaOptions, withId } from "./baseSchema.js";

export interface IExpense extends Document<string> {
  _id: string;
  branch: "NAO_STUDIO" | "DIAEL_BEAUTY";
  category: "Rent" | "Utilities" | "Supplies" | "Marketing" | "Salaries" | "Other";
  amount: number;
  date: string;
  description: string;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    category: {
      type: String,
      enum: ["Rent", "Utilities", "Supplies", "Marketing", "Salaries", "Other"],
      required: true,
    },
    amount: { type: Number, required: true },
    date: { type: String, required: true },
    description: { type: String, default: "" },
  },
  baseSchemaOptions
);

withId(ExpenseSchema);

export default models.Expense || model<IExpense>("Expense", ExpenseSchema, "expenses");
