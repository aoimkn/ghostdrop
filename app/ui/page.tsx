import { CaretLeftIcon } from "@phosphor-icons/react/dist/csr/CaretLeft";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { m } from "~/app/paraglide/messages";

export function Column({ spread = false, children }: { spread?: boolean; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh w-full justify-center md:items-center md:px-4 md:py-12">
      <div
        className={`flex min-h-dvh w-full max-w-110 flex-col gap-6 px-4 md:min-h-0 md:rounded-lg md:bg-surface-raised md:p-8 ${spread ? "justify-between py-6" : "pt-4 pb-6"}`}
      >
        {children}
      </div>
    </main>
  );
}

type Back = { to: string; onBack?: never } | { onBack: () => void; to?: never };

export function BackHeader({ children, ...back }: Back & { children: ReactNode }) {
  const className = "gd-button gd-button--subtle label min-h-11 min-w-11 p-0";
  const icon = <CaretLeftIcon size={24} aria-hidden />;
  return (
    <header className="flex min-h-11 items-center gap-2">
      {back.to === undefined ? (
        <button
          type="button"
          className={className}
          aria-label={m.common_back()}
          onClick={back.onBack}
        >
          {icon}
        </button>
      ) : (
        <Link to={back.to} className={className} aria-label={m.common_back()}>
          {icon}
        </Link>
      )}
      {children}
    </header>
  );
}
