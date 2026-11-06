export type Place = { database: string; store: string };

export async function transact(
  { database, store }: Place,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  const db = await open(database, store);
  try {
    return await settle(operation(db.transaction(store, mode).objectStore(store)));
  } finally {
    db.close();
  }
}

async function open(database: string, store: string): Promise<IDBDatabase> {
  const request = indexedDB.open(database, 1);
  request.addEventListener("upgradeneeded", () => request.result.createObjectStore(store));
  const db = await settle(request);
  if (!(db instanceof IDBDatabase)) throw new Error("failed to open IndexedDB");
  return db;
}

function settle(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB error")));
  });
}
