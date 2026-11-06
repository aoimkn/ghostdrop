import { useEffect, useState } from "react";

import { ApiError } from "~/app/lib/api.client";

export function useLockout() {
  const [until, setUntil] = useState<number | null>(null);
  useEffect(() => {
    const timer =
      until === null
        ? undefined
        : setTimeout(() => setUntil(null), Math.max(0, until - Date.now()));
    return () => clearTimeout(timer);
  }, [until]);
  const noteError = (error: unknown): boolean => {
    if (!(error instanceof ApiError) || error.code !== "too-many-attempts") return false;
    setUntil(Date.now() + (error.retryAfterSeconds ?? 0) * 1000);
    return true;
  };
  return { locked: until !== null, noteError };
}
