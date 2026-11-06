import { z } from "zod";

import { base64urlBytes } from "./http";

export const proofSchema = base64urlBytes({ maxBytes: 32 }).refine((value) => value.length === 32);

export const passphraseSchema = z.object({
  params: base64urlBytes({ maxBytes: 96 }),
  proof: proofSchema,
});

export async function verifier(proof: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", proof));
}
