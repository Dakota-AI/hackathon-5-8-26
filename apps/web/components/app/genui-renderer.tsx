"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";
import type { GenUiComponent, WorkItemSurfaceRecord } from "../../lib/control-api";
import { Panel } from "./panel";
import { StatusPill } from "./status-pill";
import { TinyStat } from "./tiny-stat";

const ALLOWED = new Set([
  "container",
  "row",
  "column",
  "stack",
  "heading",
  "text",
  "muted",
  "code",
  "markdown",
  "card",
  "panel",
  "list",
  "table",
  "stat",
  "stat-grid",
  "pill",
  "bar-chart",
  "divider"
]);

type RenderProps = {
  surface: WorkItemSurfaceRecord;
  className?: string;
};

export function GenUiSurface({ surface, className }: RenderProps) {
  const root = surface.componentTree
    ? surface.componentTree
    : surface.components && surface.components.length > 0
    ? ({ type: "stack", children: surface.components } as GenUiComponent)
    : null;

  const validated = surface.validation === "server-validated";

  return (
    <div
      className={cn(
        "rounded-[12px] border border-app-border bg-app-input p-3.5",
        !validated && "opacity-70",
        className
      )}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {surface.title ? (
            <div className="text-[14px] font-extrabold text-app-text truncate">{surface.title}</div>
          ) : null}
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-app-muted truncate">
            {surface.kind || "surface"} · {surface.componentCount ?? 0} components
          </div>
        </div>
        <StatusPill
          label={validated ? "server-validated" : "unvalidated"}
          tone={validated ? "success" : "warning"}
        />
      </div>
      {root ? (
        <RenderNode node={root} />
      ) : (
        <div className="text-[12px] text-app-muted">No structured content.</div>
      )}
    </div>
  );
}

function RenderNode({ node, depth = 0 }: { node: GenUiComponent; depth?: number }) {
  if (!node || depth > 6) return null;
  if (typeof node !== "object") return null;
  if (!ALLOWED.has(node.type)) {
    return (
      <div className="text-[11px] text-app-muted italic">
        unsupported component: <code className="font-mono">{String(node.type)}</code>
      </div>
    );
  }
  return (
    <RenderTyped node={node} depth={depth} />
  );
}

function RenderTyped({ node, depth }: { node: GenUiComponent; depth: number }) {
  const props = node.props ?? {};
  const children = node.children ?? [];

  switch (node.type) {
    case "container":
      return (
        <div className="flex flex-col gap-2">
          {children.map((c, i) => (
            <RenderNode key={i} node={c} depth={depth + 1} />
          ))}
        </div>
      );

    case "row":
      return (
        <div className="flex flex-wrap items-start gap-2">
          {children.map((c, i) => (
            <RenderNode key={i} node={c} depth={depth + 1} />
          ))}
        </div>
      );

    case "column":
    case "stack":
      return (
        <div className="flex flex-col gap-2">
          {children.map((c, i) => (
            <RenderNode key={i} node={c} depth={depth + 1} />
          ))}
        </div>
      );

    case "heading": {
      const level = clampHeadingLevel(props.level ?? 2);
      const Tag = (`h${level}`) as "h1" | "h2" | "h3" | "h4";
      const sizeMap: Record<number, string> = {
        1: "text-[20px]",
        2: "text-[17px]",
        3: "text-[15px]",
        4: "text-[14px]"
      };
      return (
        <Tag className={cn("font-extrabold tracking-[-0.01em] text-app-text", sizeMap[level])}>
          {String(node.text ?? props.text ?? children.map(asTextNode).join(""))}
        </Tag>
      );
    }

    case "text":
      return (
        <p className="text-[13px] leading-[1.5] text-app-text">
          {String(node.text ?? props.text ?? children.map(asTextNode).join(""))}
        </p>
      );

    case "muted":
      return (
        <p className="text-[12px] leading-[1.45] text-app-muted">
          {String(node.text ?? props.text ?? children.map(asTextNode).join(""))}
        </p>
      );

    case "code":
      return (
        <pre className="rounded-[8px] border border-app-border bg-app-panel-deep p-2.5 text-[11px] font-mono text-app-text overflow-x-auto">
          {String(node.text ?? props.text ?? "")}
        </pre>
      );

    case "markdown":
      return (
        <div className="ac-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {String(node.text ?? props.text ?? "")}
          </ReactMarkdown>
        </div>
      );

    case "card":
    case "panel":
      return (
        <Panel padding={12} className="flex flex-col gap-2">
          {props.title ? (
            <div className="text-[12px] font-extrabold text-app-text">{String(props.title)}</div>
          ) : null}
          {children.map((c, i) => (
            <RenderNode key={i} node={c} depth={depth + 1} />
          ))}
        </Panel>
      );

    case "list": {
      const items = (node.items ?? []) as Array<string | GenUiComponent>;
      return (
        <ul className="list-disc pl-5 text-[13px] text-app-text leading-[1.5]">
          {items.map((item, i) => (
            <li key={i} className="text-app-text">
              {typeof item === "string" ? item : <RenderNode node={item} depth={depth + 1} />}
            </li>
          ))}
        </ul>
      );
    }

    case "table": {
      const columns = (node.columns ?? Object.keys((node.rows?.[0] as Record<string, unknown>) ?? {})) as string[];
      const rows = (node.rows ?? []) as Array<Record<string, string | number>>;
      return (
        <div className="overflow-x-auto rounded-[8px] border border-app-border">
          <table className="w-full text-[12px]">
            <thead className="bg-app-panel-deep">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    className="px-2.5 py-2 text-left text-[10px] uppercase tracking-wider text-app-muted font-extrabold border-b border-app-border"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-app-border last:border-0">
                  {columns.map((c) => (
                    <td key={c} className="px-2.5 py-2 text-app-text">
                      {String(r[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "stat":
      return (
        <TinyStat
          label={String(node.label ?? props.label ?? "")}
          value={String(node.value ?? props.value ?? "")}
        />
      );

    case "stat-grid": {
      const items = (props.items as Array<{ label: string; value: string | number }>) ?? [];
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {items.map((item, i) => (
            <TinyStat key={i} label={item.label} value={String(item.value)} />
          ))}
        </div>
      );
    }

    case "pill":
      return <StatusPill label={String(node.label ?? props.label ?? "")} />;

    case "bar-chart": {
      const data = (node.data ?? (props.data as typeof node.data) ?? []) as Array<{
        label: string;
        value: number;
      }>;
      const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
      return (
        <div className="rounded-[10px] border border-app-border bg-app-panel-deep p-2.5">
          <div className="flex flex-col gap-1.5">
            {data.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-24 shrink-0 truncate text-[11px] text-app-muted">{d.label}</div>
                <div className="relative h-3 flex-1 rounded bg-app-bg">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-app-accent"
                    style={{ width: `${(d.value / max) * 100}%` }}
                  />
                </div>
                <div className="w-12 shrink-0 text-right text-[11px] font-bold text-app-text tabular-nums">
                  {d.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "divider":
      return <div className="my-2 h-px w-full bg-app-border" />;

    default:
      return null;
  }
}

function clampHeadingLevel(level: unknown): 1 | 2 | 3 | 4 {
  const n = Number(level);
  if (n === 1) return 1;
  if (n === 3) return 3;
  if (n === 4) return 4;
  return 2;
}

function asTextNode(c: GenUiComponent): string {
  if (!c) return "";
  if (typeof c.text === "string") return c.text;
  if (typeof c.label === "string") return c.label;
  return "";
}
