import mongoose, { type Document } from "mongoose";
const { Schema, model, models, Types } = mongoose;

export interface IPayrollAuditLog extends Document {
  therapistId: string;
  // Which kind of staff this log entry is about - 'therapist' is the
  // default/legacy value (every log entry before this field existed was a
  // therapist), 'manager' marks entries written by the Managers-tab sync.
  // The field is still named `therapistId` for backward compatibility with
  // existing log rows; for a manager entry it holds the manager's User id.
  staffType?: "therapist" | "manager";
  field: string;
  oldValue: number | null;
  newValue: number | null;
  source: string;
  timestamp: string;
}

const PayrollAuditLogSchema = new Schema<IPayrollAuditLog>(
  {
    therapistId: { type: String, required: true },
    staffType: { type: String, enum: ["therapist", "manager"], default: "therapist" },
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    source: { type: String, required: true },
    timestamp: { type: String, required: true },
  },
  {
    versionKey: false,
    toJSON: {
      transform: (_doc, ret: any) => {
        ret.id = ret._id?.toString?.() ?? ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export default models.PayrollAuditLog ||
  model<IPayrollAuditLog>("PayrollAuditLog", PayrollAuditLogSchema, "payrollAuditLog");
