"use client";

import * as React from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setOrderNotesAction } from "@/server/actions/refunds";
import { StickyNote } from "lucide-react";

export function OrderNotes({
  orderId, notes, editable,
}: {
  orderId: string;
  notes: string | null;
  editable: boolean;
}) {
  const [value, setValue] = React.useState(notes ?? "");
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();

  const dirty = value !== (notes ?? "");

  const save = async () => {
    setSaving(true);
    const result = await setOrderNotesAction(orderId, value);
    setSaving(false);
    if (!result.ok) {
      toast({ tone: "error", title: "Couldn't save your note", description: result.error });
      return;
    }
    toast({ tone: "success", title: "Note saved" });
  };

  if (!editable && !notes) return null;

  return (
    <Card>
      <CardHeader title="Notes" description="Only you and your team can see this." />
      <CardBody>
        {editable ? (
          <>
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Supplier sent the wrong colour — asked for a partial refund on 14 Aug."
              aria-label="Order notes"
              rows={4}
            />
            {dirty ? (
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={() => void save()} loading={saving}>Save note</Button>
                <Button size="sm" variant="ghost" onClick={() => setValue(notes ?? "")}>Discard</Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="flex gap-2 text-md whitespace-pre-wrap text-ink-muted">
            <StickyNote className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
            {notes}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
