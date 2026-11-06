import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { signIn } from "~/app/lib/account.client";
import { requireStage } from "~/app/lib/gate.client";
import { m } from "~/app/paraglide/messages";
import { Alert } from "~/app/ui/alert";
import { errorMessage, isCancelledByUser } from "~/app/ui/error-message";
import { Logo } from "~/app/ui/logo";

export async function clientLoader() {
  await requireStage("signed-out");
  return null;
}

export function HydrateFallback() {
  return null;
}

export default function SignIn() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
      await navigate("/");
    } catch (caught) {
      if (!isCancelledByUser(caught)) setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-between gap-6 px-4 py-6">
      <div className="pt-30">
        <Logo className="display text-[40px]" />
      </div>
      <div className="flex flex-col gap-2">
        {error !== null && <Alert tone="warning">{error}</Alert>}
        <button
          type="button"
          className="gd-button gd-button--primary label min-h-12"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => void submit()}
        >
          {m.account_sign_in()}
        </button>
        <Link to="/sign-up" className="gd-button gd-button--secondary label min-h-12">
          {m.account_sign_up()}
        </Link>
        <p className="caption mt-2 mb-0 text-center text-ink-muted">{m.account_passkey_hint()}</p>
      </div>
    </main>
  );
}
