import { requireSameOrigin } from "~/.server/http";

import type { Route } from "./+types/layout";

export const middleware: Route.MiddlewareFunction[] = [requireSameOrigin];
