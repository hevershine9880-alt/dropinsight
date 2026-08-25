"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { openTicketAction, replyToTicketAction, closeTicketAction } from "@/server/actions/support";
import { cn } from "@/lib/cn";
import { MessageSquare, Send, Mail, CheckCircle2 } from "lucide-react";

interface Ticket {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  messages: { id: string; body: string; fromStaff: boolean; authorName: string; createdAt: string }[];
}

export function SupportClient({ tickets }: { tickets: Ticket[] }) {
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const { toast } = useToast();
  const router = useRouter();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setErrors({});

    const result = await openTicketAction({ subject, body });
    setSending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast({ tone: "error", title: "Couldn't open that ticket", description: result.error });
      return;
    }

    setSubject("");
    setBody("");
    toast({
      tone: "success",
      title: "Ticket opened",
      description: "We usually reply within a working day. Replies appear here.",
    });
    router.refresh();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader title="Open a ticket" />
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <Field label="What do you need help with?" htmlFor="ticket-subject" error={errors.subject}>
                <Input
                  id="ticket-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Profit looks wrong on an order"
                  invalid={!!errors.subject}
                />
              </Field>

              <Field
                label="Details"
                htmlFor="ticket-body"
                error={errors.body}
                hint="An order number gets you a faster answer than a general description does."
              >
                <Textarea
                  id="ticket-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={5}
                  placeholder="Order 12-15063-13226 shows £2.31 profit but my payout report says £2.80."
                  invalid={!!errors.body}
                />
              </Field>

              <Button type="submit" variant="primary" loading={sending} disabled={!subject.trim() || !body.trim()}>
                <Send className="size-4" aria-hidden />
                Open a ticket
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Mail className="size-4 shrink-0" aria-hidden />
          Prefer email?{" "}
          <a href="mailto:support@dropinsight.app" className="font-medium text-brand hover:underline">
            support@dropinsight.app
          </a>
        </p>
      </div>

      <Card className="flex flex-col">
        <CardHeader
          title="Your tickets"
          description={tickets.length > 0 ? `${tickets.length} in total` : undefined}
        />

        {tickets.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nothing open"
            description="Anything you send appears here with our replies."
            className="flex-1 py-10"
          />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {tickets.map((ticket) => (
              <TicketThread key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TicketThread({ ticket }: { ticket: Ticket }) {
  const [expanded, setExpanded] = React.useState(ticket.status !== "CLOSED");
  const [reply, setReply] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const send = async () => {
    setSending(true);
    const result = await replyToTicketAction({ ticketId: ticket.id, body: reply });
    setSending(false);

    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't send that", description: result.error });
      return;
    }
    setReply("");
    router.refresh();
  };

  const close = async () => {
    await closeTicketAction(ticket.id);
    toast({ tone: "success", title: "Ticket closed" });
    router.refresh();
  };

  return (
    <li className="px-5 py-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-medium text-ink">{ticket.subject}</span>
          <span className="block text-xs text-ink-muted">
            Opened {format(new Date(ticket.createdAt), "d MMM yyyy")} · {ticket.messages.length} message
            {ticket.messages.length === 1 ? "" : "s"}
          </span>
        </span>
        <Badge
          tone={ticket.status === "CLOSED" ? "neutral" : ticket.status === "ANSWERED" ? "positive" : "caution"}
        >
          {ticket.status === "CLOSED" ? "Closed" : ticket.status === "ANSWERED" ? "Answered" : "Open"}
        </Badge>
      </button>

      {expanded ? (
        <>
          <ol className="mt-3 space-y-3">
            {ticket.messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "rounded-xl px-3 py-2.5",
                  message.fromStaff ? "bg-brand-soft/50" : "bg-surface-sunken",
                )}
              >
                <p className="text-xs font-medium text-ink-muted">
                  {message.fromStaff ? "DropInsight support" : message.authorName}
                  {" · "}
                  <time dateTime={message.createdAt}>
                    {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                  </time>
                </p>
                <p className="mt-1 text-md leading-relaxed whitespace-pre-wrap text-ink">{message.body}</p>
              </li>
            ))}
          </ol>

          {ticket.status !== "CLOSED" ? (
            <div className="mt-3 space-y-2">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                placeholder="Add a reply…"
                aria-label={`Reply to ${ticket.subject}`}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={() => void send()} loading={sending} disabled={!reply.trim()}>
                  <Send className="size-3.5" aria-hidden />
                  Send reply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void close()}>
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Close ticket
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
