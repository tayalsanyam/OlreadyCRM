"use client";

import { useEffect, useMemo, useState } from "react";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import { MUA_PUSH_STAGE_LABELS } from "@/lib/types";
import type { MuaPushWithDetails } from "@/lib/types";
import { formatLabelsList } from "@/lib/utils";

type Props = {
  leadId: string;
  brideName: string;
  leadCity: string;
  pushes: MuaPushWithDetails[];
  selectedPushId: string;
  onSelectedPushIdChange: (pushId: string) => void;
};

function pushOptionLabel(p: MuaPushWithDetails): string {
  const events = formatLabelsList(p.eventLabels);
  const stage = MUA_PUSH_STAGE_LABELS[p.stage];
  return events ? `${p.muaName} — ${events} · ${stage}` : `${p.muaName} — ${stage}`;
}

export function LeadMuaWhatsAppPanel({
  leadId,
  brideName,
  leadCity,
  pushes,
  selectedPushId,
  onSelectedPushIdChange,
}: Props) {
  const activePushes = useMemo(
    () =>
      pushes.filter(
        (p) => p.status === "active" || p.status === "awaitingClose",
      ),
    [pushes],
  );

  useEffect(() => {
    if (!activePushes.length) return;
    if (!activePushes.some((p) => p.id === selectedPushId)) {
      onSelectedPushIdChange(activePushes[0]!.id);
    }
  }, [activePushes, selectedPushId, onSelectedPushIdChange]);

  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);

  const push =
    activePushes.find((p) => p.id === selectedPushId) ?? activePushes[0];
  if (!push) return null;

  const muaPhone = push.muaWhatsapp ?? push.muaPhone;

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text">Select MUA *</span>
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={push.id}
          onChange={(e) => onSelectedPushIdChange(e.target.value)}
        >
          {activePushes.map((p) => (
            <option key={p.id} value={p.id}>
              {pushOptionLabel(p)}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-muted">
        <span className="font-medium text-text">{push.muaName}</span>
        {" · "}
        {MUA_PUSH_STAGE_LABELS[push.stage]}
        {muaPhone ? (
          <>
            {" · "}
            {muaPhone}
          </>
        ) : (
          <span className="text-amber-800"> · No phone on file</span>
        )}
      </div>

      <WhatsAppComposer
        key={push.id}
        audience="mua"
        phone={push.muaPhone}
        whatsapp={push.muaWhatsapp}
        leadId={leadId}
        muaId={push.muaId}
        pushStage={push.stage}
        context={{
          muaName: push.muaName,
          brideName,
          city: leadCity,
        }}
        templatePool="rmMua"
        allowCustomMessage
        templateRefreshKey={templateRefreshKey}
        onTemplatesChanged={() => setTemplateRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
