"use client";

import { signOut } from "aws-amplify/auth";
import { clearAmplifyBrowserState } from "./auth-storage";

type ResetOptions = {
  clientId?: string;
  reload?: boolean;
};

export async function resetAmplifyAuthSession(options: ResetOptions = {}): Promise<void> {
  await signOutBestEffort();

  if (typeof window !== "undefined") {
    clearAmplifyBrowserState({
      clientId: options.clientId,
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
      cookieString: window.document.cookie,
      expireCookie: expireBrowserCookie
    });

    if (options.reload !== false) {
      window.location.assign("/");
    }
  }
}

async function signOutBestEffort(): Promise<void> {
  try {
    await signOut({ global: true });
    return;
  } catch {
    // A stale or partially corrupted local session can make global sign-out fail.
    // Fall back to local sign-out and explicit browser storage cleanup below.
  }

  try {
    await signOut();
  } catch {
    // Explicit storage cleanup below is the recovery path for broken Authenticator state.
  }
}

function expireBrowserCookie(name: string): void {
  const encodedName = encodeURIComponent(name);
  const expiry = "=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.document.cookie = `${name}${expiry}`;
  if (encodedName !== name) {
    window.document.cookie = `${encodedName}${expiry}`;
  }
}
