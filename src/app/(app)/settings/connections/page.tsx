import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Connections" };

/**
 * Connections lives on its own page rather than duplicated here — one screen
 * for connecting, syncing and disconnecting, reachable from both places.
 */
export default function ConnectionsSettingsPage() {
  redirect("/ebay-accounts");
}
