import { requireSameOrigin } from "~/app/.server/http";

import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [requireSameOrigin];
