import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../lib/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { photoTypeOf } from "./profilePhotos";

/**
 * Storing a question's picture: the admin's for the bank, and a student's for
 * a test they made. Both go to the same bucket under a random name, with the
 * same checks, so one place decides what a question picture may be.
 */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const imageUploadSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().regex(/^image\//, "Only image files are supported."),
  dataBase64: z.string().min(1)
});

export type ImageUpload = z.infer<typeof imageUploadSchema>;

/** Either the stored picture's link, or why it was refused, with the status to answer with. */
export type StoredImage = { imageUrl: string } | { status: number; message: string };

export async function storeQuestionImage(upload: ImageUpload): Promise<StoredImage> {
  const buffer = Buffer.from(upload.dataBase64, "base64");

  if (buffer.byteLength === 0) {
    return { status: 400, message: "The image file was empty." };
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return { status: 413, message: "Images must be 2 MB or smaller." };
  }

  // What the file really is, from its first bytes. The name and the type are
  // whatever the browser said: a text file renamed .png was stored and kept,
  // and showed as a broken picture. Only real PNG, JPG and WebP files are
  // taken, and stored as what they are (see photoTypeOf).
  const type = photoTypeOf(buffer);

  if (!type) {
    return {
      status: 400,
      message: "That file is not a PNG, JPG or WebP picture, whatever its name says. Choose an image file."
    };
  }

  // Without Supabase there is no bucket: the picture is echoed back as a data
  // link so the flow can still be tried locally.
  if (!supabaseAdmin) {
    return { imageUrl: `data:${type.contentType};base64,${upload.dataBase64}` };
  }

  const path = `${randomUUID()}.${type.extension}`;

  const { error } = await supabaseAdmin.storage
    .from(env.questionImageBucket)
    .upload(path, buffer, { contentType: type.contentType, upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabaseAdmin.storage.from(env.questionImageBucket).getPublicUrl(path);
  return { imageUrl: data.publicUrl };
}
