import type { AdminRunnerRecord, AdminRunnerTotals } from "./control-api";

const unhealthyStatuses = new Set(["failed", "stale", "offline"]);

export function describeRunnerHealth(totals: AdminRunnerTotals): string {
  const concerns: string[] = [];
  if (totals.staleRunners > 0) {
    concerns.push(`${totals.staleRunners} stale ${plural("runner", totals.staleRunners)}`);
  }
  if (totals.failedRunners > 0) {
    concerns.push(`${totals.failedRunners} failed ${plural("runner", totals.failedRunners)}`);
  }
  if (totals.failedHosts > 0) {
    concerns.push(`${totals.failedHosts} failed ${plural("host", totals.failedHosts)}`);
  }
  if (concerns.length > 0) {
    return `${joinHuman(concerns)} need attention.`;
  }
  return `${totals.runners} ${plural("runner", totals.runners)} online/known across ${totals.hosts} ${plural("host", totals.hosts)}.`;
}

export function sortRunnerRows(runners: readonly AdminRunnerRecord[]): AdminRunnerRecord[] {
  return [...runners].sort((left, right) => {
    const leftPriority = unhealthyStatuses.has(left.status) ? 0 : 1;
    const rightPriority = unhealthyStatuses.has(right.status) ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return (right.lastHeartbeatAt || "").localeCompare(left.lastHeartbeatAt || "");
  });
}

function plural(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function joinHuman(items: readonly string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
