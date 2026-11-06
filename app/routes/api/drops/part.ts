import { cloudflareContext } from "~/app/.server/context";
import { error } from "~/app/.server/http";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/part";

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "PUT") return error(405, "method-not-allowed");
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const index = Number(params.index);
  const part = Number(params.part);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(part)) return error(404, "not-found");
  const stub = account(env, accountId);
  const target = await stub.dropUploadTarget(tokenHash, params.id, index, part);
  if (!target) return error(404, "not-found");
  if (request.headers.get("Content-Length") !== String(target.size) || !request.body) {
    return error(400, "wrong-size");
  }
  const uploaded = await env.DROPS.resumeMultipartUpload(target.key, target.uploadId).uploadPart(
    part + 1,
    request.body,
  );
  await stub.recordDropPart(params.id, index, part, uploaded.etag);
  return new Response(null, { status: 204 });
}
