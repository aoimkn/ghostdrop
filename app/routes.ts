import { type RouteConfig, layout, prefix, route } from "@react-router/dev/routes";

export default [
  ...prefix("api", [
    layout("routes/api/layout.ts", [
      route("sign-up/options", "routes/api/sign-up-options.ts"),
      route("sign-up", "routes/api/sign-up.ts"),
      route("sign-in/options", "routes/api/sign-in-options.ts"),
      route("sign-in", "routes/api/sign-in.ts"),
      layout("routes/api/authenticated.ts", [
        route("session", "routes/api/session.ts"),
        route("sign-out", "routes/api/sign-out.ts"),
        route("passkeys", "routes/api/passkeys.ts"),
        route("passkeys/options", "routes/api/passkeys-options.ts"),
        route("passkeys/:id", "routes/api/passkey.ts"),
      ]),
    ]),
  ]),
] satisfies RouteConfig;
