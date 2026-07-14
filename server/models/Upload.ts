import mongoose, { type Document } from "mongoose";
const { Schema, model, models } = mongoose;

export interface IUpload extends Document<string> {
  _id: string;
  contentType: string;
  dataBase64: string;
  createdAt: Date;
}

const UploadSchema = new Schema<IUpload>({
  _id: { type: String, required: true },
  contentType: { type: String, required: true },
  dataBase64: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default models.Upload || model<IUpload>("Upload", UploadSchema, "uploads");
