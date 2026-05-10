"use client";

import * as React from "react";

const STORAGE_KEY = "agents-cloud:workspace";
const DEFAULT_WORKSPACE = "workspace-web";

const KNOWN_WORKSPACES: Workspace[] = [
  { id: "workspace-web", label: "Web command center" },
  { id: "workspace-admin-playground", label: "Admin playground" },
  { id: "workspace-personal", label: "Personal workspace" }
];

export type Workspace = { id: string; label: string };

type WorkspaceContextValue = {
  workspaceId: string;
  workspaces: Workspace[];
  setWorkspaceId: (id: string) => void;
  addWorkspace: (id: string, label?: string) => void;
};

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const ctx = React.useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaceId, setWorkspaceIdState] = React.useState<string>(DEFAULT_WORKSPACE);
  const [extra, setExtra] = React.useState<Workspace[]>([]);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setWorkspaceIdState(stored);
      const extraRaw = window.localStorage.getItem(`${STORAGE_KEY}:extra`);
      if (extraRaw) setExtra(JSON.parse(extraRaw));
    } catch {
      /* ignore */
    }
  }, []);

  const setWorkspaceId = React.useCallback((id: string) => {
    setWorkspaceIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const addWorkspace = React.useCallback((id: string, label?: string) => {
    setExtra((prev) => {
      if (prev.some((w) => w.id === id) || KNOWN_WORKSPACES.some((w) => w.id === id)) return prev;
      const next = [...prev, { id, label: label ?? id }];
      try {
        window.localStorage.setItem(`${STORAGE_KEY}:extra`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    setWorkspaceId(id);
  }, [setWorkspaceId]);

  const workspaces = React.useMemo(() => [...KNOWN_WORKSPACES, ...extra], [extra]);

  return (
    <WorkspaceContext.Provider value={{ workspaceId, workspaces, setWorkspaceId, addWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
