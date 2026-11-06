export const FORMAT_VERSION = 1;
export const MAX_DROP_BYTES = 100 * 1024 * 1024;
export const MAX_ITEMS = 1000;
export const RECORD_BYTES = 64 * 1024;
export const TAG_BYTES = 16;
export const SEALED_RECORD_BYTES = RECORD_BYTES + TAG_BYTES;
// R2 multipart uploads need equal parts of at least 5 MiB except the last one.
export const RECORDS_PER_PART = 128;
export const PART_BYTES = RECORDS_PER_PART * SEALED_RECORD_BYTES;

// Items are padded so the server learns only an approximate size: at least one record,
// so short texts look alike, then Padmé (https://petsymposium.org/popets/2019/popets-2019-0056.pdf).
export function paddedSize(size: number): number {
  const length = Math.max(size, RECORD_BYTES);
  const exponent = Math.floor(Math.log2(length));
  const step = 2 ** (exponent - Math.floor(Math.log2(exponent)) - 1);
  return Math.ceil(length / step) * step;
}

export function isPaddedSize(padded: number): boolean {
  return Number.isSafeInteger(padded) && padded >= RECORD_BYTES && paddedSize(padded) === padded;
}

// From one record upwards Padmé adds less than 1/32, so this bounds what any drop within
// the content limit can occupy once padded.
export function maxPaddedTotal(items: number): number {
  return MAX_DROP_BYTES + MAX_DROP_BYTES / 32 + items * RECORD_BYTES;
}

export function recordCount(padded: number): number {
  return Math.ceil(padded / RECORD_BYTES);
}

export function sealedSize(padded: number): number {
  return padded + recordCount(padded) * TAG_BYTES;
}

export function partCount(padded: number): number {
  return Math.ceil(recordCount(padded) / RECORDS_PER_PART);
}

export function partSize(padded: number, part: number): number {
  return Math.min(PART_BYTES, sealedSize(padded) - part * PART_BYTES);
}
