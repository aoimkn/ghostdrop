import { requireSession } from "~/app/.server/session";

import type { Route } from "./+types/authenticated";

export const middleware: Route.MiddlewareFunction[] = [requireSession];
