import type { Place } from "./idb.client";

// The service worker writes a share here and home takes it, so both read these names.
export const SHARE_PLACE: Place = { database: "ghostdrop-share", store: "share" };
export const SHARE_KEY = "pending";
