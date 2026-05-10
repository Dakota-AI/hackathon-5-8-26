"use client";

import * as React from "react";
import { CopyIcon, ExternalLinkIcon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { createControlApiWorkItem, getControlApiHealth } from "../../lib/control-api";
import { useAuth } from "../auth-context";
import { useWorkspace } from "../workspace-context";
import { Button } from "./button";
import { Panel } from "./panel";
import { SectionHeader } from "./section-header";
import { StatusPill } from "./status-pill";
import { TinyStat } from "./tiny-stat";

type BoardRecord = {
  id: string;
  name: string;
  url: string;
  context: string;
  createdAt: string;
};

const storageKey = "agents-cloud.miro.boards.v1";

export function MiroBoard() {
  const { isAuthed, openSignIn } = useAuth();
  const { workspaceId } = useWorkspace();
  const api = getControlApiHealth();
  const [boards, setBoards] = React.useState<BoardRecord[]>([]);
  const [name, setName] = React.useState("Launch planning board");
  const [url, setUrl] = React.useState("https://miro.com/app/board/");
  const [context, setContext] = React.useState("Use this board for launch plan, customer journey, and open decisions.");
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setBoards(raw ? JSON.parse(raw) : []);
    } catch {
      setBoards([]);
    }
  }, []);

  React.useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(boards));
  }, [boards]);

  function addBoard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) return;
    const board = {
      id: `${Date.now()}`,
      name: trimmedName,
      url: normalizeUrl(trimmedUrl),
      context: context.trim() || "No context added yet.",
      createdAt: new Date().toISOString()
    };
    setBoards((current) => [board, ...current]);
    setMessage("Board saved locally for this browser session.");
  }

  async function createBoardWorkItem(board: BoardRecord) {
    if (!isAuthed || !api.configured) {
      openSignIn();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await createControlApiWorkItem({
        workspaceId,
        objective: `Use Miro board "${board.name}" as planning context. Board: ${board.url}. Context: ${board.context}`
      });
      setMessage("Created a live work item from that Miro board context.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create work item.");
    } finally {
      setBusy(false);
    }
  }

  async function copyContext(board: BoardRecord) {
    const text = `${board.name}\n${board.url}\n\n${board.context}`;
    await navigator.clipboard?.writeText(text);
    setMessage("Board context copied.");
  }

  return (
    <div className="flex flex-col gap-3 p-2 md:p-3.5">
      <Panel padding={14}>
        <SectionHeader
          title="Miro Boards"
          subtitle="Attach board links, capture context, and turn visual planning into live agent work."
        />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <StatusPill label={`${boards.length} connected boards`} tone="info" />
          <StatusPill label="local browser registry" tone="warning" />
          {isAuthed ? <StatusPill label={`workspace: ${workspaceId}`} tone="success" /> : null}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(360px,4fr)_minmax(0,6fr)]">
        <Panel padding={14}>
          <SectionHeader title="Connect a board" subtitle="Paste any Miro board URL and summarize what agents should read from it." />
          <form onSubmit={addBoard} className="mt-3 flex flex-col gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-[8px] border border-app-border bg-app-input px-3 py-2 text-[13px] text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-text/40"
              placeholder="Board name"
            />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="rounded-[8px] border border-app-border bg-app-input px-3 py-2 text-[13px] text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-text/40"
              placeholder="https://miro.com/app/board/..."
            />
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              className="min-h-[96px] rounded-[8px] border border-app-border bg-app-input px-3 py-2 text-[13px] text-app-text placeholder:text-app-muted focus:outline-none focus:border-app-text/40"
              placeholder="What should agents know about this board?"
            />
            <Button type="submit" variant="primary" size="md">
              <PlusIcon /> Save board
            </Button>
          </form>
          {message ? <div className="mt-2 text-[12px] text-app-accent">{message}</div> : null}
        </Panel>

        <Panel padding={14}>
          <SectionHeader title="Board workspace" subtitle="Open, copy, delete, or convert any board into an agent work item." />
          <div className="mt-3 grid grid-cols-1 gap-2">
            {boards.length ? (
              boards.map((board) => (
                <div key={board.id} className="rounded-[12px] border border-app-border bg-app-input p-3">
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill label="Miro" tone="info" />
                    <StatusPill label={new Date(board.createdAt).toLocaleDateString()} tone="warning" />
                  </div>
                  <div className="mt-2 text-sm font-black text-app-text">{board.name}</div>
                  <div className="mt-1 truncate font-mono text-[11px] text-app-muted">{board.url}</div>
                  <p className="mt-2 text-[12px] leading-[1.4] text-app-muted">{board.context}</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <TinyStat label="Action" value="open board" />
                    <TinyStat label="Context" value="copyable" />
                    <TinyStat label="Agent handoff" value={isAuthed ? "live" : "sign-in gated"} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" onClick={() => window.open(board.url, "_blank", "noopener,noreferrer")}>
                      <ExternalLinkIcon /> Open
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void copyContext(board)}>
                      <CopyIcon /> Copy context
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void createBoardWorkItem(board)} disabled={busy}>
                      Create work item
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setBoards((current) => current.filter((item) => item.id !== board.id))}
                    >
                      <TrashIcon /> Remove
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex h-40 flex-col items-center justify-center rounded-[12px] border border-app-border bg-app-input text-center">
                <div className="text-sm font-extrabold text-app-text">No boards connected yet</div>
                <div className="mt-1 text-[12px] text-app-muted">Add a board on the left to activate this workspace.</div>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function normalizeUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}
