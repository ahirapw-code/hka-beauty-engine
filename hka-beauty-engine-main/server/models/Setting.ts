import { Schema, model, models, Document } from "mongoose";
import { baseSchemaOptions, withId } from "./baseSchema";

/**
 * Generic settings documents (e.g. "sheets_config", "branchProfile_NAO_STUDIO").
 * `strict: false` lets each document store whatever arbitrary fields it needs,
 * mirroring the schemaless `settings` collection that existed in Firestore.
 */
export interface ISetting extends Document<string> {
  _id: string;
  [key: string]: any;
}

const SettingSchema = new Schema<ISetting>({}, { ...baseSchemaOptions, strict: false });

withId(SettingSchema);

export default models.Setting || model<ISetting>("Setting", SettingSchema, "settings");
