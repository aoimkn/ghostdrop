import { Link } from "react-router";

import { m } from "~/app/paraglide/messages";
import { Logo } from "~/app/ui/logo";
import { Column } from "~/app/ui/page";

export function ErrorScreen({ notFound = false }: { notFound?: boolean }) {
  return (
    <Column spread>
      <div className="flex flex-col gap-6 pt-30 md:pt-0">
        <Logo className="display text-[40px]" />
        <div className="flex flex-col gap-2">
          <h1 className="title m-0">
            {notFound ? m.error_not_found_title() : m.error_unknown_title()}
          </h1>
          {!notFound && <p className="body m-0 text-ink-muted">{m.error_unknown_body()}</p>}
        </div>
      </div>
      <Link to="/" reloadDocument className="gd-button gd-button--primary label min-h-12">
        {m.common_go_home()}
      </Link>
    </Column>
  );
}
