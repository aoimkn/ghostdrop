import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { z } from "zod";

import { isValidDeviceName, normalizeDeviceName } from "~/app/lib/device-name";

export const deviceNameSchema = z.string().refine(isValidDeviceName).transform(normalizeDeviceName);

export function newDeviceId(): string {
  return isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(16)));
}
