import { useEffect } from "react";
import {
  isRouteErrorResponse,
  type LinksFunction,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type MiddlewareFunction,
} from "react-router";

import { m } from "./paraglide/messages";
import { getLocale } from "./paraglide/runtime";
import { paraglideMiddleware } from "./paraglide/server";
import { ErrorScreen } from "./ui/error-screen";
import { registerServiceWorker, useUpdateOnNavigation } from "./ui/update";
import "./app.css";

import type { Route } from "./+types/root";

export const middleware: MiddlewareFunction<Response>[] = [
  ({ request }, next) => paraglideMiddleware(request, () => next()),
];

export function loader({ request }: Route.LoaderArgs) {
  return { origin: new URL(request.url).origin };
}

// The origin never changes while the app is open, so client navigations need not ask the server.
export function shouldRevalidate() {
  return false;
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: "ghostdrop" },
  { name: "description", content: m.common_description() },
  { property: "og:type", content: "website" },
  { property: "og:title", content: "ghostdrop" },
  { property: "og:description", content: m.common_description() },
  { property: "og:image", content: `${loaderData?.origin ?? ""}/og.png` },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { name: "twitter:card", content: "summary_large_image" },
];

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getLocale()}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1a1b26" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#eef0f7" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  useEffect(registerServiceWorker, []);
  useUpdateOnNavigation();
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <ErrorScreen notFound={isRouteErrorResponse(error) && error.status === 404} />;
}
