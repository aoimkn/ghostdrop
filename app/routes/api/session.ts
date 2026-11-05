import { sessionContext } from "~/.server/session";

import type { Route } from "./+types/session";

export function loader({ context }: Route.LoaderArgs) {
  return Response.json({ accountId: context.get(sessionContext).accountId });
}
