import { useEffect } from "react";
import { createPath, useBlocker } from "react-router";

// A new service worker takes over open pages at once, but a page keeps running the code it loaded.
// The new version is loaded only when the screen changes anyway: on navigating, or on coming back
// to an idle screen. Never while something held only in the page (a transfer, received content, a
// draft) would be lost.
let ready = false;
const holds = new Set<symbol>();

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const container = navigator.serviceWorker;
  const hadController = container.controller !== null;
  container.addEventListener("controllerchange", () => {
    if (hadController) ready = true;
  });
  void container.register("/sw.js", { updateViaCache: "none" });
}

function canUpdate(): boolean {
  return ready && holds.size === 0;
}

export function useUpdateOnNavigation(): void {
  const blocker = useBlocker(canUpdate);
  useEffect(() => {
    if (blocker.state === "blocked") window.location.assign(createPath(blocker.location));
  }, [blocker]);
}

// For a screen that holds something only in the page: while it is busy the update waits, and once
// it is idle, coming back to the page loads the new version.
export function useUpdateWhenIdle(idle: boolean): void {
  useEffect(() => {
    if (!idle) {
      const hold = Symbol("hold");
      holds.add(hold);
      return () => {
        holds.delete(hold);
      };
    }
    const onVisible = () => {
      if (document.visibilityState === "visible" && canUpdate()) window.location.reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [idle]);
}
