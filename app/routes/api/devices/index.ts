import { z } from "zod";

import { cloudflareContext } from "~/app/.server/context";
import { error, readJson, tooManyAttempts } from "~/app/.server/http";
import { deviceNameSchema, newDeviceId } from "~/app/.server/device";
import { proofSchema, verifier } from "~/app/.server/passphrase-proof";
import { account, sessionContext } from "~/app/.server/session";

import type { Route } from "./+types/index";

const body = z.object({ name: deviceNameSchema, proof: proofSchema });

export async function loader({ context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const stub = account(env, accountId);
  const current = await stub.currentDevice(tokenHash);
  const devices = await stub.listDevices();
  return Response.json(
    devices.map((device) => ({ ...device, current: device.id === current?.id })),
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") return error(405, "method-not-allowed");
  const { env } = context.get(cloudflareContext);
  const { accountId, tokenHash } = context.get(sessionContext);
  const { name, proof } = await readJson(request, body);
  const result = await account(env, accountId).addDevice(
    tokenHash,
    { id: newDeviceId(), name },
    await verifier(proof),
  );
  if (result.result === "wrong-passphrase") return error(403, result.result);
  if (result.result === "too-many-attempts") return tooManyAttempts(result.retryAt);
  if (result.result === "already-added" || result.result === "name-taken") {
    return error(409, result.result);
  }
  return new Response(null, { status: 204 });
}
