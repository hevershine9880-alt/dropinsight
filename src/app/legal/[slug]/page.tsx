import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/brand/logo";
import { ArrowLeft } from "lucide-react";

const DOCUMENTS = {
  terms: {
    title: "Terms of service",
    updated: "24 August 2026",
    sections: [
      {
        heading: "What DropInsight is",
        body: "DropInsight is an analytics tool for eBay sellers. It reads your order, fee and seller-performance data from eBay and presents it back to you with the costs you enter. It does not list items, message buyers, issue refunds or change prices.",
      },
      {
        heading: "Your data is yours",
        body: "The buying prices, supplier answers, expenses and notes you enter belong to you. You can export all of it as CSV at any time, and disconnecting an eBay account never deletes what you have already entered.",
      },
      {
        heading: "The numbers are a tool, not filed accounts",
        body: "Every figure is calculated from your own records and from what eBay reports. DropInsight is not an accountant and its statements are not a substitute for filed accounts or tax advice.",
      },
      {
        heading: "Trials and subscriptions",
        body: "Trials last 14 days. When a trial or subscription ends nothing is deleted — syncing pauses until you subscribe, and everything already imported stays available.",
      },
      {
        heading: "Availability",
        body: "We aim to keep DropInsight running continuously, but eBay's APIs have rate limits and outages we do not control. When a sync fails, we tell you plainly rather than showing stale figures as if they were current.",
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    updated: "24 August 2026",
    sections: [
      {
        heading: "What we store",
        body: "Your name and email, your workspace's settings, and the eBay data needed to calculate profit: orders, line items, fees, refunds and seller-performance metrics. Plus what you enter — buying prices, suppliers, expenses and notes.",
      },
      {
        heading: "eBay credentials",
        body: "OAuth tokens are encrypted at rest with AES-256-GCM and are never sent to the browser. They are used only to read your own seller data through eBay's official APIs, using read-only scopes.",
      },
      {
        heading: "Passwords",
        body: "Passwords are hashed with Argon2id and are never stored or logged in a readable form. Session tokens are stored only as a SHA-256 hash, so a database leak does not hand out live sessions.",
      },
      {
        heading: "Who can see your data",
        body: "Only people you invite to your workspace, limited by the role you give them. Every query is scoped to your workspace at the database level. We do not sell data or share it with advertisers.",
      },
      {
        heading: "Deleting your data",
        body: "Ask support and we will delete your workspace and everything in it. Disconnecting an eBay account removes its credentials immediately while keeping the orders and costs you have already built up.",
      },
    ],
  },
} as const;

type Slug = keyof typeof DOCUMENTS;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const document = DOCUMENTS[slug as Slug];
  return { title: document?.title ?? "Legal" };
}

export function generateStaticParams() {
  return Object.keys(DOCUMENTS).map((slug) => ({ slug }));
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = DOCUMENTS[slug as Slug];
  if (!document) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="inline-flex rounded-lg">
        <Wordmark size="sm" />
      </Link>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight">{document.title}</h1>
      <p className="mt-1.5 text-sm text-ink-muted">Last updated {document.updated}</p>

      <div className="mt-8 space-y-6">
        {document.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            <p className="mt-1.5 text-md leading-relaxed text-ink-muted">{section.body}</p>
          </section>
        ))}
      </div>

      <p className="mt-10 border-t border-line pt-6 text-sm text-ink-muted">
        Questions? <Link href="/support" className="font-medium text-brand hover:underline">Contact support</Link>.
      </p>

      <Link
        href="/sign-in"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Back to sign in
      </Link>
    </main>
  );
}
