"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";

type Props = {
  ticketId: string;
  ticketNumber: string;
  raisedByType: string;
  muaName: string | null;
  muaPhone: string | null;
  muaWhatsapp?: string | null;
  brideName?: string | null;
  bridePhone?: string | null;
  city?: string | null;
  onLogged?: () => void;
};

export function TicketWhatsAppPanel({
  ticketId,
  ticketNumber,
  raisedByType,
  muaName,
  muaPhone,
  muaWhatsapp,
  brideName,
  bridePhone,
  city,
  onLogged,
}: Props) {
  const isBrideTicket = raisedByType === "bride";
  const showBride = isBrideTicket && Boolean(bridePhone?.trim());
  const showMua = Boolean((muaPhone ?? muaWhatsapp)?.trim());

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-semibold text-brand">WhatsApp</h2>
        <p className="mt-1 text-xs text-slate-muted">
          {isBrideTicket
            ? "Contact the bride and/or the tagged MUA on this complaint."
            : "Message the MUA on this ticket."}
        </p>
      </div>

      {showBride && (
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Bride</span>
            <Badge variant="hot">Complainant</Badge>
          </div>
          <WhatsAppComposer
            audience="bride"
            bridePhone={bridePhone}
            leadId={undefined}
            ticketId={ticketId}
            templatePool="care"
            allowCustomMessage
            context={{
              brideName: brideName ?? "there",
              ticketNumber,
            }}
            onLogged={onLogged}
          />
        </div>
      )}

      {showMua && (
        <div className="space-y-2 rounded-lg border border-slate-100 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">MUA</span>
            {isBrideTicket ? (
              <Badge variant="critical">Complaint against</Badge>
            ) : (
              <Badge variant="muted">Complainant</Badge>
            )}
          </div>
          <WhatsAppComposer
            audience="mua"
            phone={muaPhone}
            whatsapp={muaWhatsapp ?? muaPhone}
            ticketId={ticketId}
            templatePool="care"
            allowCustomMessage
            context={{
              muaName: muaName ?? "there",
              city: city ?? undefined,
              ticketNumber,
            }}
            onLogged={onLogged}
          />
        </div>
      )}

      {!showBride && !showMua && (
        <p className="text-sm text-slate-muted">
          No phone numbers on file — link a lead or MUA to enable WhatsApp.
        </p>
      )}
    </Card>
  );
}
