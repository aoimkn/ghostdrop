import type { Page } from "@playwright/test";

type Credential = {
  credentialId: string;
  isResidentCredential: boolean;
  privateKey: string;
  signCount: number;
  rpId?: string;
  userHandle?: string;
};

export type Authenticator = {
  credentials(): Promise<Credential[]>;
  add(credentials: readonly Credential[]): Promise<void>;
};

export async function attachAuthenticator(page: Page): Promise<Authenticator> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return {
    credentials: async () =>
      (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials,
    add: async (credentials) => {
      for (const credential of credentials) {
        await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
      }
    },
  };
}
