import source from "~/app/service-worker.js?raw";

export function loader() {
  return new Response(source.replaceAll("__VERSION__", import.meta.env.BUILD_ID ?? "dev"), {
    headers: { "Content-Type": "text/javascript", "Cache-Control": "no-cache" },
  });
}
