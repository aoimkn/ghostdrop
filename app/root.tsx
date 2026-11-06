import {
  isRouteErrorResponse,
  Link,
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
import { Logo } from "./ui/logo";
import { Column } from "./ui/page";
import "./app.css";

import type { Route } from "./+types/root";

export const middleware: MiddlewareFunction<Response>[] = [
  ({ request }, next) => paraglideMiddleware(request, () => next()),
];

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getLocale()}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <Column spread>
      <div className="flex flex-col gap-6 pt-30">
        <Logo className="display text-[40px]" />
        <div className="flex flex-col gap-2">
          <h1 className="title m-0">
            {notFound ? m.error_not_found_title() : m.error_unknown_title()}
          </h1>
          <p className="body m-0 text-ink-muted">
            {notFound ? m.error_not_found_body() : m.error_unknown_body()}
          </p>
        </div>
      </div>
      <Link to="/" reloadDocument className="gd-button gd-button--primary label min-h-12">
        {m.common_go_home()}
      </Link>
    </Column>
  );
}
