import * as React from "react";
import { MetricCard } from "./metric-card";

const cards = [
  { label: "Runs", value: "0", hint: "API live" },
  { label: "Teams", value: "3", hint: "Exec / build / research" },
  { label: "Artifacts", value: "0", hint: "S3 planned" },
  { label: "Previews", value: "0", hint: "*.preview.solo-ceo.ai" }
];

export function MetricsStrip() {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-2.5">
      {cards.map((c) => (
        <MetricCard key={c.label} {...c} />
      ))}
    </div>
  );
}
