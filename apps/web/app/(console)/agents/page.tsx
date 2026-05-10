import * as React from "react";
import { PlaceholderPage } from "../../../components/app/placeholder-page";

export default function AgentsPage() {
  return (
    <PlaceholderPage
      title="Agents & Teams"
      subtitle="Inspect the executive, research, build, and evaluator agents — and the teams composed from them. This roadmap surface unifies live agent rosters with their roles, recent activity, and trust scope."
      bullets={["Executive agent", "Research team", "Build team", "Evaluator agents", "Specialist creation"]}
    />
  );
}
