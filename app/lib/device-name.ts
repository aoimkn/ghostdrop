import { codePointCount } from "./text";

export const MAX_DEVICE_NAME_LENGTH = 32;

export function normalizeDeviceName(name: string): string {
  return name.normalize("NFC").trim();
}

export function isValidDeviceName(name: string): boolean {
  const normalized = normalizeDeviceName(name);
  return normalized !== "" && codePointCount(normalized) <= MAX_DEVICE_NAME_LENGTH;
}
