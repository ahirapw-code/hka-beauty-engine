import { Schema } from "mongoose";

/**
 * Shared schema options: we use the app-provided string `id` as the Mongo
 * primary key (_id) so documents keep exactly the same identifiers they had
 * in Firestore (e.g. "TX-1234", "att-1234", Firebase UIDs, etc.).
 *
 * toJSON/toObject transforms expose a plain `id` field (instead of `_id`)
 * and drop internal `__v`, mirroring the shape the React frontend already
 * expects from Firestore documents.
 */
export const baseSchemaOptions = {
  _id: false as const,
  versionKey: false as const,
  timestamps: false as const,
  toJSON: {
    virtuals: true,
    transform: (_doc: any, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
  toObject: {
    virtuals: true,
    transform: (_doc: any, ret: any) => {
      delete ret.__v;
      return ret;
    },
  },
};

export function withId(schema: Schema) {
  schema.add({ _id: { type: String, required: true } });
  schema.virtual("id").get(function (this: any) {
    return this._id;
  });
  return schema;
}
