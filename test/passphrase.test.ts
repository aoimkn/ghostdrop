import { describe, expect, it } from "vitest";

import { deriveKey, isLongEnough, newParams, proof } from "~/app/lib/passphrase";

const PASSPHRASE = "correct horse battery staple";

describe("passphrase", () => {
  it("requires 15 code points after normalization", () => {
    expect(isLongEnough("a".repeat(14))).toBe(false);
    expect(isLongEnough("a".repeat(15))).toBe(true);
    expect(isLongEnough("😀".repeat(15))).toBe(true);
    expect(isLongEnough("é".repeat(14) + "x")).toBe(true);
    expect(isLongEnough("é".repeat(7))).toBe(false);
  });

  it("creates versioned parameters with a fresh salt", () => {
    const [a, b] = [newParams(), newParams()];
    expect(a).toHaveLength(17);
    expect(a[0]).toBe(1);
    expect(a).not.toEqual(b);
  });

  it("derives a non-extractable key whose proof depends on passphrase and salt", async () => {
    const params = newParams();
    const key = await deriveKey(PASSPHRASE, params);
    expect(key.extractable).toBe(false);
    const expected = await proof(key);
    expect(expected).toHaveLength(32);
    expect(await proof(await deriveKey(PASSPHRASE, params))).toEqual(expected);
    expect(await proof(await deriveKey(`${PASSPHRASE}!`, params))).not.toEqual(expected);
    expect(await proof(await deriveKey(PASSPHRASE, newParams()))).not.toEqual(expected);
  });

  it("treats canonically equivalent passphrases as the same", async () => {
    const params = newParams();
    const composed = await proof(await deriveKey("café au lait, s'il vous", params));
    const decomposed = await proof(await deriveKey("café au lait, s'il vous", params));
    expect(decomposed).toEqual(composed);
  });

  it("rejects parameters of an unknown version", async () => {
    const params = newParams();
    params[0] = 2;
    await expect(deriveKey(PASSPHRASE, params)).rejects.toThrow(
      "unsupported passphrase parameters",
    );
  });
});
