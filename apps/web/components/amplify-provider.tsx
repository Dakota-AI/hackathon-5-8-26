"use client";

import { Amplify } from "aws-amplify";
import { getAmplifyConfig } from "../lib/amplify-config";

let amplifyConfigured = false;

function ensureAmplifyConfigured() {
  if (amplifyConfigured) {
    return;
  }

  const config = getAmplifyConfig();
  if (!config) {
    return;
  }

  Amplify.configure(config, { ssr: true });
  amplifyConfigured = true;
}

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  ensureAmplifyConfigured();
  return <>{children}</>;
}
