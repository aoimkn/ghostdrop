import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { cloudflareContext } from "~/app/.server/context";
import { error, readJson } from "~/app/.server/http";
import { passphraseSchema, verifier } from "~/app/.server/passphrase";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/passphrase";

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId } = context.get(sessionContext);
  const params = await account(env, accountId).passphraseParams();
  if (!params) return error(404, "not-found");
  return Response.json({ params: isoBase64URL.fromBuffer(new Uint8Array(params)) });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "PUT") return error(405, "method-not-allowed");
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const { params, proof } = await readJson(request, passphraseSchema);
  await account(env, accountId).replacePassphrase(
    { params, verifier: await verifier(proof) },
    tokenHash,
  );
  return new Response(null, { status: 204 });
}
