import mongoose, { type Document } from "mongoose";
const { Schema, model, models } = mongoose;
import { baseSchemaOptions, withId } from "./baseSchema.js";

export interface IProduct extends Document<string> {
  _id: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  branch: "NAO_STUDIO" | "DIAEL_BEAUTY";
  category: string;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    sku: { type: String, required: true },
    price: { type: Number, required: true },
    cost: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    minStock: { type: Number, default: 0 },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    category: { type: String, required: true },
  },
  baseSchemaOptions
);

withId(ProductSchema);

export default models.Product || model<IProduct>("Product", ProductSchema, "products");
