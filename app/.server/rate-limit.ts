import type { MiddlewareFunction } from "react-router";

import { cloudflareContext } from "./context";
import { error } from "./http";

export const limitAuthAttempts: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
  const { env } = context.get(cloudflareContext);
  if (!(await env.AUTH_LIMITER.limit({ key: networkOf(request) })).success) {
    throw error(429, "rate-limited");
  }
  return next();
};

// One IPv6 holder usually controls a whole /64, so IPv6 addresses are counted by prefix.
export function networkOf(request: Request): string {
  const address = request.headers.get("CF-Connecting-IP") ?? "";
  if (!address.includes(":")) return address;
  const [head = "", tail] = address.toLowerCase().split("::");
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === undefined || tail === "" ? [] : tail.split(":");
  const groups = [
    ...headGroups,
    ...Array.from({ length: 8 - headGroups.length - tailGroups.length }, () => "0"),
    ...tailGroups,
  ];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
