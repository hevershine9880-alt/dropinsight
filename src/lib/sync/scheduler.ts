import { prisma } from "@/lib/db/client";
import { runNextJob, enqueueSync } from "./engine";
import { pruneExpiredSessions } from "@/lib/auth/session";
import { pruneRateLimits } from "@/lib/rate-limit";
import { generateInsights } from "@/lib/insights";
import { runAutomations } from "@/lib/automation/runner";

/**
 * The worker tick.
 *
 * Driven by POST /api/jobs/tick — from the dev poller in the browser, or from
 * cron/a queue runner in production. Doing the work here rather than inside a
 * page request is why a 900-order history import does not hold a page open.
 */

const MAX_JOBS_PER_TICK = 3;
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export interface TickResult {
  jobsRun: number;
  jobsQueued: number;
  ordersImported: number;
  sessionsPruned: number;
  insightsGenerated: number;
  automationsRun: number;
}

export async function tick(): Promise<TickResult> {
  const result: TickResult = {
    jobsRun: 0,
    jobsQueued: 0,
    ordersImported: 0,
    sessionsPruned: 0,
    insightsGenerated: 0,
    automationsRun: 0,
  };

  result.jobsQueued = await queueDueSyncs();

  for (let i = 0; i < MAX_JOBS_PER_TICK; i++) {
    const run = await runNextJob();
    if (!run) break;
    result.jobsRun += 1;
    result.ordersImported += run.outcome.ordersImported;
  }

  if (result.ordersImported > 0) {
    result.automationsRun = await runAutomations();
    result.insightsGenerated = await refreshInsightsForActiveWorkspaces();
  }

  result.sessionsPruned = await pruneExpiredSessions();
  pruneRateLimits();

  return result;
}

/**
 * Queue an incremental sync for every connected account whose last sync has
 * aged out. Accounts needing reconnection are skipped — retrying a dead token
 * only produces noise.
 */
async function queueDueSyncs(): Promise<number> {
  const cutoff = new Date(Date.now() - AUTO_SYNC_INTERVAL_MS);
  const accounts = await prisma.ebayAccount.findMany({
    where: {
      status: "CONNECTED",
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    select: { id: true, workspaceId: true },
  });

  let queued = 0;
  for (const account of accounts) {
    // Syncing pauses when a subscription lapses. (R17.4)
    if (!(await syncingAllowed(account.workspaceId))) continue;
    await enqueueSync(account.workspaceId, account.id, "INCREMENTAL");
    queued += 1;
  }
  return queued;
}

async function syncingAllowed(workspaceId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!sub) return true;
  if (sub.status === "ACTIVE") return true;
  if (sub.status === "TRIALING") return !sub.trialEndsAt || sub.trialEndsAt > new Date();
  return false;
}

async function refreshInsightsForActiveWorkspaces(): Promise<number> {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  let total = 0;
  for (const w of workspaces) {
    total += await generateInsights(w.id);
  }
  return total;
}
