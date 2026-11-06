import { ApiError } from "~/app/lib/api.client";
import { formatTime } from "~/app/ui/format";
import { MAX_PENDING_DROPS } from "~/app/lib/drop-format";
import { m } from "~/app/paraglide/messages";
import { getLocale } from "~/app/paraglide/runtime";

export function isCancelledByUser(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  );
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return m.error_unknown();
  switch (error.code) {
    case "rate-limited":
      return m.error_rate_limited();
    case "too-many-attempts":
      return m.error_too_many_attempts({
        time: formatTime(getLocale(), Date.now() + (error.retryAfterSeconds ?? 0) * 1000),
      });
    case "wrong-passphrase":
      return m.error_wrong_passphrase();
    case "name-taken":
      return m.error_name_taken();
    case "limit-reached":
      return m.error_limit_reached({ limit: MAX_PENDING_DROPS });
    case "too-large":
      return m.error_too_large();
    case "too-many-items":
      return m.error_too_many_items();
    case "last-passkey":
      return m.error_last_passkey();
    case "passkey-exists":
      return m.error_passkey_exists();
    case "account-exists":
      return m.error_account_exists();
    default:
      return m.error_unknown();
  }
}
