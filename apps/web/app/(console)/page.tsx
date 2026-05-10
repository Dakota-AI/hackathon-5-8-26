import * as React from "react";
import { WorkDashboard } from "../../components/app/work-dashboard";
import { HeroCommandPanel } from "../../components/app/hero-command-panel";
import { MetricsStrip } from "../../components/app/metrics-strip";
import { LiveRunTimeline } from "../../components/app/live-run-timeline";
import { GenUiPreviewPanel } from "../../components/app/genui-preview-panel";
import { HostRedirect } from "../../components/app/host-redirect";

export default function CommandCenterPage() {
  return (
    <div className="flex flex-col gap-3 p-2 md:p-3.5">
      <HostRedirect />
      <WorkDashboard />
      <HeroCommandPanel />
      <MetricsStrip />
      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="xl:flex-[7] min-w-0">
          <LiveRunTimeline />
        </div>
        <div className="xl:flex-[5] min-w-0">
          <GenUiPreviewPanel />
        </div>
      </div>
    </div>
  );
}
