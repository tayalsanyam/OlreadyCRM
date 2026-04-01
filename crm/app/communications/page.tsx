"use client";

export default function CommunicationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Communications</h1>
      <div className="card max-w-xl">
        <p className="text-slate-400">
          Future integration: message or email leads by stage. Select stage(s), compose, send.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Planned: WhatsApp, Email (SMTP/SendGrid), SMS. Templates. n8n workflows.
        </p>
      </div>
    </div>
  );
}
