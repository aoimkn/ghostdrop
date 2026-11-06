import { type Place, transact } from "./idb.client";

const PLACE: Place = { database: "ghostdrop", store: "keys" };
const KEY = "passphrase";

export async function saveKey(key: CryptoKey): Promise<void> {
  await transact(PLACE, "readwrite", (store) => store.put(key, KEY));
}

export async function loadKey(): Promise<CryptoKey | null> {
  const value: unknown = await transact(PLACE, "readonly", (store) => store.get(KEY));
  return value instanceof CryptoKey ? value : null;
}

export async function clearKey(): Promise<void> {
  await transact(PLACE, "readwrite", (store) => store.delete(KEY));
}
