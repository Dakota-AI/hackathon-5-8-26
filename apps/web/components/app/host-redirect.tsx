"use client";

import * as React from "react";

/**
 * Lightweight client redirect: when served on `admin.solo-ceo.ai`, send
 * the visitor to `/admin`. Replaces the legacy host-routed-home flash.
 */
export function HostRedirect() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hostname === "admin.solo-ceo.ai" && window.location.pathname === "/") {
      window.location.replace("/admin");
    }
  }, []);
  return null;
}
