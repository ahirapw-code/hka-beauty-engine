import mongoose, { type Document } from "mongoose";
const { Schema, model, models } = mongoose;
import { baseSchemaOptions, withId } from "./baseSchema.js";

export interface IService extends Document<string> {
  _id: string;
  name: string;
  category: "Hair" | "Nails" | "Lashes" | "Skincare" | "Massage";
  price: number;
  duration: number;
  branches: string[];
}

const ServiceSchema = new Schema<IService>(
  {
    name: { type: String, required: true },
    category: {
      type: String,
      enum: ["Hair", "Nails", "Lashes", "Skincare", "Massage"],
      required: true,
    },
    price: { type: Number, required: true },
    duration: { type: Number, required: true },
    branches: { type: [String], default: [] },
  },
  baseSchemaOptions
);

withId(ServiceSchema);

export default models.Service || model<IService>("Service", ServiceSchema, "services");
