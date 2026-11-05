import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

type Credential = { id: string; keyPair: CryptoKeyPair; userHandle: string; rpId: string };

type Options = { origin?: string; userVerified?: boolean };

export class SoftwareAuthenticator {
  readonly credentials: Credential[] = [];

  constructor(private readonly origin: string) {}

  async create(
    options: PublicKeyCredentialCreationOptionsJSON,
    { origin = this.origin, userVerified = true }: Options = {},
  ): Promise<RegistrationResponseJSON> {
    const keyPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const rawId = crypto.getRandomValues(new Uint8Array(16));
    const id = isoBase64URL.fromBuffer(rawId);
    this.credentials.push({ id, keyPair, userHandle: options.user.id, rpId: options.rp.id! });

    const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const coseKey = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, isoBase64URL.toBuffer(jwk.x!)],
        [-3, isoBase64URL.toBuffer(jwk.y!)],
      ]),
    );
    const attestedCredentialData = concat(
      new Uint8Array(16),
      new Uint8Array([0, rawId.length]),
      rawId,
      coseKey,
    );
    const authData = concat(
      await authenticatorData(options.rp.id!, flags(userVerified) | 0x40),
      attestedCredentialData,
    );
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]) as Parameters<typeof isoCBOR.encode>[0],
    );
    return {
      id,
      rawId: id,
      type: "public-key",
      response: {
        clientDataJSON: clientData("webauthn.create", options.challenge, origin),
        attestationObject: isoBase64URL.fromBuffer(attestationObject),
        transports: ["internal", "hybrid"],
      },
      clientExtensionResults: {},
    };
  }

  async get(
    options: PublicKeyCredentialRequestOptionsJSON,
    {
      origin = this.origin,
      userVerified = true,
      credential = this.credentials[0],
    }: Options & { credential?: Credential } = {},
  ): Promise<AuthenticationResponseJSON> {
    if (!credential) throw new Error("no credential");
    const authData = await authenticatorData(credential.rpId, flags(userVerified));
    const clientDataJSON = clientData("webauthn.get", options.challenge, origin);
    const clientDataHash = await sha256(isoBase64URL.toBuffer(clientDataJSON));
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        credential.keyPair.privateKey,
        concat(authData, clientDataHash),
      ),
    );
    return {
      id: credential.id,
      rawId: credential.id,
      type: "public-key",
      response: {
        clientDataJSON,
        authenticatorData: isoBase64URL.fromBuffer(authData),
        signature: isoBase64URL.fromBuffer(derSignature(signature)),
        userHandle: credential.userHandle,
      },
      clientExtensionResults: {},
    };
  }
}

function flags(userVerified: boolean): number {
  const userPresent = 0x01;
  const backupEligibleAndBackedUp = 0x08 | 0x10;
  return userPresent | (userVerified ? 0x04 : 0) | backupEligibleAndBackedUp;
}

async function authenticatorData(rpId: string, flagBits: number): Promise<Uint8Array<ArrayBuffer>> {
  return concat(
    await sha256(new TextEncoder().encode(rpId)),
    new Uint8Array([flagBits]),
    new Uint8Array(4),
  );
}

function clientData(type: string, challenge: string, origin: string): string {
  return isoBase64URL.fromUTF8String(
    JSON.stringify({ type, challenge, origin, crossOrigin: false }),
  );
}

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

function derSignature(raw: Uint8Array): Uint8Array<ArrayBuffer> {
  const integer = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.slice(start);
    const value = trimmed[0]! & 0x80 ? concat(new Uint8Array([0]), trimmed) : trimmed;
    return concat(new Uint8Array([0x02, value.length]), value);
  };
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
