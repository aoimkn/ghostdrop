import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { z } from "zod";

export const deviceNameSchema = z
  .string()
  .transform((value) => value.normalize("NFC").trim())
  .pipe(z.string().min(1));

export function newDeviceId(): string {
  return isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(16)));
}
