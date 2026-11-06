import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { z } from "zod";

const bytes = (maxLength: number) =>
  z
    .string()
    .max(maxLength)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((value) => isoBase64URL.toBuffer(value));

export const proofSchema = bytes(43).refine((value) => value.length === 32);

export const passphraseSchema = z.object({ params: bytes(128), proof: proofSchema });

export const deviceNameSchema = z
  .string()
  .transform((value) => value.normalize("NFC").trim())
  .pipe(z.string().min(1));

export async function verifier(proof: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", proof));
}

export function newDeviceId(): string {
  return isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(16)));
}
