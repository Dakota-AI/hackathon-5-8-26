"use client";

import * as React from "react";
import { Amplify } from "aws-amplify";
import { getAmplifyConfig } from "../lib/amplify-config";
import { AuthProvider } from "./auth-context";
import { WorkspaceProvider } from "./workspace-context";

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
  return (
    <AuthProvider>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </AuthProvider>
  );
}
