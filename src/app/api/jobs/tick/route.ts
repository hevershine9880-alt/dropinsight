import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/session";
import { tick } from "@/lib/sync/scheduler";
import { safeEqual } from "@/lib/crypto";

export const maxDuration = 60;

/**
 * The worker entry point.
 *
 * Accepts either a signed-in user (the in-app poller) or a bearer token
 * matching JOB_RUNNER_TOKEN (cron, a queue runner, a container sidecar).
 * Without one of the two it does nothing — this endpoint moves real data.
 */
export async function POST(request: NextRequest) {
  const token = process.env.JOB_RUNNER_TOKEN;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const authorisedByToken = !!token && !!header && safeEqual(token, header);
  const authorisedByUser = !authorisedByToken && !!(await getAuth());

  if (!authorisedByToken && !authorisedByUser) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  try {
    const result = await tick();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[jobs] tick failed", error);
    return NextResponse.json({ error: "The worker tick failed." }, { status: 500 });
  }
}
