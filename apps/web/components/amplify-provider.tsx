"use client";

import { Amplify } from "aws-amplify";
import { useEffect } from "react";
import { getAmplifyConfig } from "../lib/amplify-config";

export function AmplifyProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const config = getAmplifyConfig();
    if (!config) {
      return;
    }

    Amplify.configure(config, { ssr: true });
  }, []);

  return <>{children}</>;
}
