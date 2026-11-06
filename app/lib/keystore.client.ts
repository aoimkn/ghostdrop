const DATABASE = "ghostdrop";
const STORE = "keys";
const KEY = "passphrase";

export async function saveKey(key: CryptoKey): Promise<void> {
  await transact("readwrite", (store) => store.put(key, KEY));
}

export async function loadKey(): Promise<CryptoKey | null> {
  const value: unknown = await transact("readonly", (store) => store.get(KEY));
  return value instanceof CryptoKey ? value : null;
}

export async function clearKey(): Promise<void> {
  await transact("readwrite", (store) => store.delete(KEY));
}

async function transact(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  const database = await open();
  try {
    return await settle(operation(database.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    database.close();
  }
}

async function open(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE, 1);
  request.addEventListener("upgradeneeded", () => request.result.createObjectStore(STORE));
  const database = await settle(request);
  if (!(database instanceof IDBDatabase)) throw new Error("failed to open IndexedDB");
  return database;
}

function settle(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB error")));
  });
}
