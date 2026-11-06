import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { z } from "zod";

import { cloudflareContext } from "~/app/.server/context";
import { error, readJson } from "~/app/.server/http";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/index";

const body = z.object({
  target: z.string().nullable(),
  items: z.array(z.object({ size: z.number().int().nonnegative() })).min(1),
});

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const drops = await account(env, accountId).listDrops(tokenHash);
  if (!drops) return error(403, "no-device");
  return Response.json(
    drops.map((drop) => ({
      ...drop,
      manifest: isoBase64URL.fromBuffer(new Uint8Array(drop.manifest)),
    })),
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") return error(405, "method-not-allowed");
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const { target, items } = await readJson(request, body);
  if (!(await env.DROP_LIMITER.limit({ key: accountId })).success) {
    return error(429, "rate-limited");
  }
  const result = await account(env, accountId).createDrop(
    tokenHash,
    target,
    items.map(({ size }) => size),
  );
  if (result.result === "created") return Response.json({ id: result.id }, { status: 201 });
  if (result.result === "no-device" || result.result === "locked") return error(403, result.result);
  if (result.result === "bad-target" || result.result === "invalid-size") {
    return error(400, result.result);
  }
  if (result.result === "too-many-items" || result.result === "too-large") {
    return error(413, result.result);
  }
  return error(409, result.result);
}
