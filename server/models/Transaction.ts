import { Schema, model, models, Document } from "mongoose";
import { baseSchemaOptions, withId } from "./baseSchema.js";

export interface ITransactionItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  type: "service" | "product";
  therapistId?: string;
  discountValue?: number;
  discountType?: "percent" | "flat";
}

export interface ITransaction extends Document<string> {
  _id: string;
  customerName: string;
  customerId?: string;
  branch: "NAO_STUDIO" | "DIAEL_BEAUTY";
  items: ITransactionItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: "cash" | "card" | "bank_transfer" | "e_wallet";
  date: string;
  cashierName: string;
  idempotencyKey?: string;
}

const TransactionItemSchema = new Schema<ITransactionItem>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    type: { type: String, enum: ["service", "product"], required: true },
    therapistId: { type: String },
    discountValue: { type: Number, default: 0 },
    discountType: { type: String, enum: ["percent", "flat"], default: "flat" },
  },
  { _id: false }
);

const TransactionSchema = new Schema<ITransaction>(
  {
    customerName: { type: String, default: "" },
    customerId: { type: String },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    items: { type: [TransactionItemSchema], default: [] },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "bank_transfer", "e_wallet"],
      required: true,
    },
    date: { type: String, required: true },
    cashierName: { type: String, default: "" },
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  baseSchemaOptions
);

withId(TransactionSchema);

export default models.Transaction || model<ITransaction>("Transaction", TransactionSchema, "transactions");
