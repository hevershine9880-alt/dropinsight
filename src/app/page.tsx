import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";

/**
 * The root is a router, not a landing page: signed in goes to the dashboard,
 * signed out to sign-in, and a half-finished workspace to onboarding.
 */
export default async function RootPage() {
  const auth = await getAuth();
  if (!auth) redirect("/sign-in");
  redirect(auth.workspace.onboardingStep === "DONE" ? "/dashboard" : "/onboarding");
}
