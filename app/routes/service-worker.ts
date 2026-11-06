import { SHARE_KEY, SHARE_PLACE } from "~/app/lib/share";
import source from "~/app/service-worker.js?raw";

const filled = source
  .replaceAll("__VERSION__", import.meta.env.BUILD_ID ?? "dev")
  .replaceAll("__SHARE_DATABASE__", SHARE_PLACE.database)
  .replaceAll("__SHARE_STORE__", SHARE_PLACE.store)
  .replaceAll("__SHARE_KEY__", SHARE_KEY);

export function loader() {
  return new Response(filled, {
    headers: { "Content-Type": "text/javascript", "Cache-Control": "no-cache" },
  });
}
