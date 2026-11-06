import { useState } from "react";
import { useNavigate } from "react-router";

import { signOut } from "~/app/lib/account.client";
import { m } from "~/app/paraglide/messages";
import { Dialog } from "~/app/ui/dialog";

export function SignOutDialog({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await signOut();
      await navigate("/sign-in");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={m.account_sign_out_title()}
      body={m.account_sign_out_body()}
      confirmLabel={m.account_sign_out_confirm()}
      danger
      busy={busy}
      onCancel={onCancel}
      onConfirm={() => void confirm()}
    />
  );
}
