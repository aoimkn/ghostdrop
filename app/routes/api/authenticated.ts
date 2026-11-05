import { requireSession } from "~/.server/session";

import type { Route } from "./+types/authenticated";

export const middleware: Route.MiddlewareFunction[] = [requireSession];
