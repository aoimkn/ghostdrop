import { useEffect, useState } from "react";

// A new service worker takes over open pages at once; a page that already had one is still running
// the previous version's code until it reloads.
export function useUpdateReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const container = navigator.serviceWorker;
    const hadController = container.controller !== null;
    const onChange = () => {
      if (hadController) setReady(true);
    };
    container.addEventListener("controllerchange", onChange);
    return () => container.removeEventListener("controllerchange", onChange);
  }, []);
  return ready;
}
