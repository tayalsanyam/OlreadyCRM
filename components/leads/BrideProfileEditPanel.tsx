"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { MakeupLookProfileFields } from "@/components/leads/MakeupLookProfileFields";
import { LeadAIAssistPanel } from "@/components/leads/LeadAIAssistPanel";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import { EMPTY_MAKEUP_LOOK, type MakeupLookProfileInput } from "@/lib/makeup-look";
import type { LeadFull, Region } from "@/lib/types";

const REGIONS: { value: Region; label: string }[] = [
  { value: "north", label: "North" },
  { value: "east", label: "East" },
  { value: "west", label: "West" },
  { value: "south", label: "South" },
];

export function BrideProfileEditPanel({
  lead,
  events = [],
  onSaved,
  onContactLogged,
  showWhatsApp = true,
}: {
  lead: LeadFull;
  events?: { id: string; ceremonyType: string }[];
  onSaved: () => void;
  onContactLogged?: () => void;
  showWhatsApp?: boolean;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    brideName: lead.brideName,
    phone: lead.phone,
    email: lead.email ?? "",
    city: lead.city,
    region: lead.region,
    eventLocation: lead.eventLocation ?? "",
    groupSize: lead.groupSize != null ? String(lead.groupSize) : "",
    groupNotes: lead.groupNotes ?? "",
  });
  const [makeup, setMakeup] = useState<MakeupLookProfileInput>({ ...EMPTY_MAKEUP_LOOK });

  const makeupEvents = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        label: e.ceremonyType,
      })),
    [events],
  );

  useEffect(() => {
    void fetch(`/api/leads/${lead.id}/makeup-look`)
      .then((r) => r.json())
      .then((j: { data?: MakeupLookProfileInput | null }) => {
        if (!j.data) return;
        const data = j.data;
        if (events.length && data.perEventLooks) {
          const remapped = { ...data.perEventLooks };
          for (const e of events) {
            if (remapped[e.id]) continue;
            if (remapped[e.ceremonyType]) {
              remapped[e.id] = remapped[e.ceremonyType];
              delete remapped[e.ceremonyType];
            }
          }
          setMakeup({ ...data, perEventLooks: remapped });
        } else {
          setMakeup(data);
        }
      });
  }, [lead.id, events]);

  async function save() {
    setBusy(true);
    const [profileRes, makeupRes] = await Promise.all([
      fetch(`/api/leads/${lead.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brideName: form.brideName,
          phone: form.phone,
          email: form.email || null,
          city: form.city,
          region: form.region,
          eventLocation: form.eventLocation || null,
          groupSize: form.groupSize ? Number(form.groupSize) : null,
          groupNotes: form.groupNotes || null,
        }),
      }),
      fetch(`/api/leads/${lead.id}/makeup-look`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(makeup),
      }),
    ]);
    setBusy(false);
    if (!profileRes.ok || !makeupRes.ok) {
      toast("Could not save profile", "error");
      return;
    }
    toast("Profile saved");
    onSaved();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Bride name"
          value={form.brideName}
          onChange={(e) => setForm({ ...form, brideName: e.target.value })}
        />
        <Input
          label="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <Input
          label="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label="City"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <Select
          label="Region"
          value={form.region ?? ""}
          onChange={(e) => setForm({ ...form, region: e.target.value as Region })}
          options={REGIONS}
        />
        <Input
          label="Event location"
          value={form.eventLocation}
          onChange={(e) => setForm({ ...form, eventLocation: e.target.value })}
        />
        <Input
          label="Group size"
          type="number"
          value={form.groupSize}
          onChange={(e) => setForm({ ...form, groupSize: e.target.value })}
        />
        <Input
          label="Group notes"
          value={form.groupNotes}
          onChange={(e) => setForm({ ...form, groupNotes: e.target.value })}
        />
      </div>

      <MakeupLookProfileFields
        value={makeup}
        onChange={setMakeup}
        events={makeupEvents}
        leadId={lead.id}
        showV2
        defaultOpen={false}
      />

      {showWhatsApp ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-muted">Bride-side templates — scroll to MUA conversations for artist messages.</p>
          <WhatsAppComposer
            audience="bride"
            leadId={lead.id}
            bridePhone={form.phone}
            context={{ brideName: form.brideName, city: form.city }}
            templatePool="rmBride"
            onLogged={onContactLogged}
          />
        </div>
      ) : null}

      <LeadAIAssistPanel leadId={lead.id} />

      <Button onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : "Save bride profile"}
      </Button>
    </div>
  );
}
