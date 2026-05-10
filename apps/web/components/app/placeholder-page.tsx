import * as React from "react";
import { Panel } from "./panel";
import { StatusPill } from "./status-pill";

type PlaceholderPageProps = {
  title: string;
  subtitle: string;
  bullets: string[];
};

export function PlaceholderPage({ title, subtitle, bullets }: PlaceholderPageProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-3 py-6">
      <Panel padding={22} className="w-full max-w-[760px]">
        <div className="text-[28px] font-extrabold tracking-[-0.02em] text-app-text">{title}</div>
        <p className="mt-2 text-sm leading-[1.5] text-app-muted">{subtitle}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {bullets.map((bullet) => (
            <StatusPill key={bullet} label={bullet} tone="info" />
          ))}
        </div>
      </Panel>
    </div>
  );
}
