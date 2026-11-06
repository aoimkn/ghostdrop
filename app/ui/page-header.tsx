import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { m } from "~/app/paraglide/messages";

export function PageHeader({ back, children }: { back: string; children: ReactNode }) {
  return (
    <header className="flex min-h-11 items-center gap-2">
      <Link
        to={back}
        className="gd-button gd-button--subtle label min-h-11 min-w-11"
        aria-label={m.common_back()}
      >
        <CaretLeftIcon size={24} aria-hidden />
      </Link>
      <h1 className="title m-0">{children}</h1>
    </header>
  );
}

export function Column({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-6 px-4 pt-4 pb-6">
      {children}
    </main>
  );
}
