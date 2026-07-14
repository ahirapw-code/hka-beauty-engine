import mongoose, { type Document } from "mongoose";
const { Schema, model, models } = mongoose;
import { baseSchemaOptions, withId } from "./baseSchema.js";

export interface IAttendance extends Document<string> {
  _id: string;
  userId: string;
  userName: string;
  role: "HKA_MANAGEMENT" | "SALON_MANAGER" | "THERAPIST";
  branch: "NAO_STUDIO" | "DIAEL_BEAUTY";
  date: string;
  clockIn: string;
  clockOut?: string;
  status: "active" | "completed";
  notes?: string;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    role: {
      type: String,
      enum: ["HKA_MANAGEMENT", "SALON_MANAGER", "THERAPIST"],
      required: true,
    },
    branch: { type: String, enum: ["NAO_STUDIO", "DIAEL_BEAUTY"], required: true },
    date: { type: String, required: true },
    clockIn: { type: String, required: true },
    clockOut: { type: String },
    status: { type: String, enum: ["active", "completed"], default: "active" },
    notes: { type: String, default: "" },
  },
  baseSchemaOptions
);

withId(AttendanceSchema);

export default models.Attendance || model<IAttendance>("Attendance", AttendanceSchema, "attendance");
