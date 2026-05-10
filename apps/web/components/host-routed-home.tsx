"use client";

import { useEffect, useState } from "react";
import { AdminConsole } from "./admin-console";
import { CommandCenter } from "./command-center";

export function HostRoutedHome() {
  const [hostname, setHostname] = useState<string | undefined>();

  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  if (hostname === "admin.solo-ceo.ai") {
    return <AdminConsole />;
  }

  return <CommandCenter />;
}
