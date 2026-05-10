"use client";

import * as React from "react";
import { Authenticator, useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import { resetAmplifyAuthSession } from "../lib/auth-session-reset";
import { readAmplifyEnv } from "../lib/amplify-config";
import { Button } from "./app/button";

type AuthContextValue = {
  isAuthed: boolean;
  userLabel: string | null;
  bypass: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

const bypassEnv =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_AGENTS_CLOUD_DEV_AUTH_BYPASS === "1";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <Authenticator.Provider>
      <InnerAuthProvider>{children}</InnerAuthProvider>
    </Authenticator.Provider>
  );
}

function InnerAuthProvider({ children }: { children: React.ReactNode }) {
  const { user, route } = useAuthenticator((ctx) => [ctx.user, ctx.route]);
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [hydratedUser, setHydratedUser] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function probe() {
      try {
        const current = await getCurrentUser();
        if (!cancelled) {
          setHydratedUser(current.signInDetails?.loginId || current.username || "Signed in");
        }
      } catch {
        if (!cancelled) setHydratedUser(null);
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, [user]);

  React.useEffect(() => {
    if (route === "authenticated" && signInOpen) {
      setSignInOpen(false);
    }
  }, [route, signInOpen]);

  const isAuthed = bypassEnv || Boolean(user) || Boolean(hydratedUser);
  const userLabel = bypassEnv
    ? "Local session"
    : user?.signInDetails?.loginId || user?.username || hydratedUser || null;

  const value: AuthContextValue = {
    isAuthed,
    userLabel,
    bypass: bypassEnv,
    openSignIn: () => setSignInOpen(true),
    closeSignIn: () => setSignInOpen(false),
    signOut: async () => {
      await resetAmplifyAuthSession({ clientId: readAmplifyEnv().userPoolClientId, reload: false });
      setHydratedUser(null);
    }
  };

  // Probe id token in background to keep session detection robust
  React.useEffect(() => {
    void fetchAuthSession().catch(() => undefined);
  }, []);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {signInOpen && !isAuthed ? <SignInModal onClose={() => setSignInOpen(false)} /> : null}
    </AuthContext.Provider>
  );
}

function SignInModal({ onClose }: { onClose: () => void }) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-[440px]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[18px] font-extrabold tracking-[-0.02em] text-app-text">
              Sign in to Agents Cloud
            </div>
            <div className="mt-1 text-[12px] text-app-muted">
              Continue with your Cognito-managed account.
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        <Authenticator hideSignUp={false} />
      </div>
    </div>
  );
}
