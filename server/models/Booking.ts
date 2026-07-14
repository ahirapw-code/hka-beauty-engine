import mongoose, { type Document } from "mongoose";
const { Schema, model, models } = mongoose;
import { baseSchemaOptions, withId } from "./baseSchema.js";

export interface IBooking extends Document<string> {
  _id: string;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  serviceName: string;
  therapistId: string;
  therapistName: string;
  branch: "NAO_STUDIO" | "DIAEL_BEAUTY";
  date: string;
  time: string;
  duration: number;
  price: number;
  status: "pending" | "checked_in" | "completed" | "cancelled";
  notes?: string;
}

const BookingSchema = new Schema<IBooking>(
  {
    customerName: { type: String, required: true },
    customerPhone: { type: String, default: "" },
    serviceId: { type: String, required: true },
    serviceName: { type: String, required: true },
    therapistId: { type: String, required: true },
    therapistName: { type: String, required: true },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    duration: { type: Number, required: true },
    price: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "checked_in", "completed", "cancelled"],
      default: "pending",
    },
    notes: { type: String, default: "" },
  },
  baseSchemaOptions
);

withId(BookingSchema);

export default models.Booking || model<IBooking>("Booking", BookingSchema, "bookings");
