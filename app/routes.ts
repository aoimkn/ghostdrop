import { type RouteConfig, layout, prefix, route } from "@react-router/dev/routes";

export default [
  ...prefix("api", [
    layout("routes/api/layout.ts", [
      route("sign-up/options", "routes/api/auth/sign-up-options.ts"),
      route("sign-up", "routes/api/auth/sign-up.ts"),
      route("sign-in/options", "routes/api/auth/sign-in-options.ts"),
      route("sign-in", "routes/api/auth/sign-in.ts"),
      layout("routes/api/authenticated.ts", [
        route("session", "routes/api/auth/session.ts"),
        route("sign-out", "routes/api/auth/sign-out.ts"),
        route("passkeys", "routes/api/passkeys/index.ts"),
        route("passkeys/options", "routes/api/passkeys/options.ts"),
        route("passkeys/:id", "routes/api/passkeys/passkey.ts"),
        route("passphrase", "routes/api/account/passphrase.ts"),
        route("devices", "routes/api/devices/index.ts"),
        route("devices/:id", "routes/api/devices/device.ts"),
        route("device/unlock", "routes/api/devices/unlock.ts"),
        route("account", "routes/api/account/index.ts"),
        route("drops", "routes/api/drops/index.ts"),
        route("drops/:id", "routes/api/drops/drop.ts"),
        route("drops/:id/items/:index", "routes/api/drops/item.ts"),
        route("drops/:id/items/:index/parts/:part", "routes/api/drops/part.ts"),
        route("drops/:id/complete", "routes/api/drops/complete.ts"),
        route("drops/:id/received", "routes/api/drops/received.ts"),
        route("events", "routes/api/drops/events.ts"),
      ]),
    ]),
  ]),
] satisfies RouteConfig;
