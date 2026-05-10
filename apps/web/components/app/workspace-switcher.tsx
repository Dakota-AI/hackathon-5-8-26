"use client";

import * as React from "react";
import { CaretSortIcon, CheckIcon, PlusIcon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";
import { useWorkspace } from "../workspace-context";

export function WorkspaceSwitcher({ compact }: { compact?: boolean }) {
  const { workspaceId, workspaces, setWorkspaceId, addWorkspace } = useWorkspace();
  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [draftId, setDraftId] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  const current = workspaces.find((w) => w.id === workspaceId);
  const label = current?.label ?? workspaceId;

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-[6px] border border-app-border bg-app-input",
          "px-2 py-1 text-[11px] font-bold text-app-text hover:border-app-border-strong",
          compact ? "max-w-[140px]" : "max-w-[220px]"
        )}
      >
        <span className="truncate">{label}</span>
        <CaretSortIcon className="h-3 w-3 shrink-0 text-app-muted" />
      </button>
      {open ? (
        <div className="absolute right-0 mt-1 w-[260px] rounded-[8px] border border-app-border bg-app-panel-deep p-1 shadow-2xl z-30">
          <div className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-app-muted">
            Workspace
          </div>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                setWorkspaceId(w.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px]",
                w.id === workspaceId ? "bg-app-input text-app-text" : "text-app-muted hover:bg-app-input/60 hover:text-app-text"
              )}
            >
              <div className="min-w-0">
                <div className="truncate font-bold">{w.label}</div>
                <div className="truncate text-[10px] text-app-muted">{w.id}</div>
              </div>
              {w.id === workspaceId ? <CheckIcon className="h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          ))}
          <div className="my-1 h-px bg-app-border" />
          {adding ? (
            <form
              className="flex flex-col gap-1.5 p-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (draftId.trim().length > 0) {
                  addWorkspace(draftId.trim());
                  setDraftId("");
                  setAdding(false);
                  setOpen(false);
                }
              }}
            >
              <input
                value={draftId}
                onChange={(e) => setDraftId(e.target.value)}
                placeholder="workspace-id"
                className="rounded-[6px] border border-app-border bg-app-input px-2 py-1 text-[12px] text-app-text focus:outline-none focus:border-app-text/40"
                autoFocus
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setDraftId("");
                  }}
                  className="rounded-[6px] px-2 py-1 text-[11px] text-app-muted hover:text-app-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-[6px] bg-app-accent px-2 py-1 text-[11px] font-bold text-[#050505]"
                >
                  Add
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] text-app-muted hover:bg-app-input/60 hover:text-app-text"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add workspace ID
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
