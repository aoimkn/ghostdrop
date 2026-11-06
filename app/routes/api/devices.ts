import { z } from "zod";

import { cloudflareContext } from "~/.server/context";
import { error, readJson } from "~/.server/http";
import { deviceNameSchema, newDeviceId, proofSchema, verifier } from "~/.server/passphrase";
import { account, sessionContext } from "~/.server/session";

import type { Route } from "./+types/devices";

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
  if (result === "wrong-passphrase") return error(403, "wrong-passphrase");
  if (result === "already-added") return error(409, "already-added");
  if (result === "name-taken") return error(409, "name-taken");
  return new Response(null, { status: 204 });
}
