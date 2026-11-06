import { codePointCount } from "./text";

const VERSION = 1;
const SALT_BYTES = 16;
// OWASP's recommendation for PBKDF2-HMAC-SHA256. Argon2id is preferable but no browser
// implements it natively yet; a new VERSION can switch once one does.
const ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 15;

export function normalize(passphrase: string): string {
  return passphrase.normalize("NFC");
}

// Length counts Unicode code points, as NIST SP 800-63B specifies, not grapheme clusters.
export function isLongEnough(passphrase: string): boolean {
  return codePointCount(normalize(passphrase)) >= MIN_PASSPHRASE_LENGTH;
}

export function newParams(): Uint8Array<ArrayBuffer> {
  const params = new Uint8Array(1 + SALT_BYTES);
  params[0] = VERSION;
  crypto.getRandomValues(params.subarray(1));
  return params;
}

export async function deriveKey(passphrase: string, params: Uint8Array): Promise<CryptoKey> {
  if (params[0] !== VERSION || params.length !== 1 + SALT_BYTES) {
    throw new Error("unsupported passphrase parameters");
  }
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalize(passphrase)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: params.slice(1), iterations: ITERATIONS },
    material,
    256,
  );
  return crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveBits", "deriveKey"]);
}

export async function proof(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(),
      info: new TextEncoder().encode("ghostdrop passphrase proof"),
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}
