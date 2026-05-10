"use client";

import { Amplify } from "aws-amplify";
import { useEffect, useState } from "react";
import { getAmplifyConfig, readAmplifyEnv } from "../lib/amplify-config";
import { resetAmplifyAuthSession } from "../lib/auth-session-reset";

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    const config = getAmplifyConfig();
    if (!config) {
      return;
    }

    Amplify.configure(config, { ssr: true });
    setConfigured(true);
  }, []);

  return (
    <>
      <AmplifyStatus configured={configured} />
      {children}
    </>
  );
}

function AmplifyStatus({ configured }: { configured: boolean }) {
  const env = readAmplifyEnv();
  const hasEnv = Boolean(env.region && env.userPoolId && env.userPoolClientId);

  return (
    <div className="runtime-banner" role="status">
      <span className={hasEnv ? "dot dot-ready" : "dot dot-waiting"} />
      <span>
        Amplify Auth {configured ? "configured" : hasEnv ? "ready" : "not configured"}
      </span>
      {!hasEnv ? <span className="banner-muted">using product shell mode</span> : null}
      {hasEnv ? (
        <button
          className="banner-link-button"
          type="button"
          onClick={() => void resetAmplifyAuthSession({ clientId: env.userPoolClientId })}
        >
          Reset sign-in
        </button>
      ) : null}
    </div>
  );
}
