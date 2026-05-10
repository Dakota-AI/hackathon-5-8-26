import * as React from "react";
import { PlaceholderPage } from "../../../components/app/placeholder-page";

export default function MiroPage() {
  return (
    <PlaceholderPage
      title="Miro Boards"
      subtitle="Embedded collaboration boards are next on the roadmap. When wired, agents will be able to read board context, propose diagrams, and sync research tables back to the run ledger."
      bullets={[
        "Connect Miro workspace",
        "Read board context",
        "Create diagrams",
        "Sync research tables"
      ]}
    />
  );
}
