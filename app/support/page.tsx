"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SupportCareChat } from "@/components/support/SupportCareChat";
import { SupportInterestForm } from "@/components/support/SupportInterestForm";
import { SupportHeader } from "@/components/support/SupportHeader";
import {
  getTicketCategoriesForRaisedBy,
  type TicketCategoryDef,
} from "@/lib/ticket-categories";
import {
  MAX_INTAKE_ATTACHMENTS,
  MAX_TICKET_ATTACHMENT_BYTES,
  TICKET_ATTACHMENT_ACCEPT,
} from "@/lib/ticket-attachments";
import { CARE_EMAIL, CARE_PHONE_DISPLAY } from "@/lib/care-contact";
import { formatDate, formatDateTime } from "@/lib/utils";

type Tab = "chat" | "interest" | "submit" | "track";

type LookupResult = {
  ticketNumber: string;
  statusLabel: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  activity?: Array<{ at: string; label: string }>;
  nextStep?: string | null;
};

type SubmitResult = {
  ticketNumber: string;
  ackRequested?: boolean;
  ackSent?: boolean;
  attachmentsSaved?: number;
  attachmentErrors?: string[];
  message: string;
  updated?: boolean;
};

type OpenTicket = {
  id: string;
  ticketNumber: string;
  category: string;
  status: string;
  createdAt: string;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Ask AI" },
  { id: "interest", label: "Get started" },
  { id: "submit", label: "Submit concern" },
  { id: "track", label: "Track status" },
];

export default function SupportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-sm text-neutral-600">
          Loading support…
        </div>
      }
    >
      <SupportPageContent />
    </Suspense>
  );
}

function SupportPageContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(
    initialTab === "submit" || initialTab === "interest" || initialTab === "track"
      ? initialTab
      : "chat",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    category: "other",
    complaint: "",
    raisedByType: "mua",
  });
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupTicket, setLookupTicket] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [openTickets, setOpenTickets] = useState<OpenTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string>("");
  const [openTicketsLoading, setOpenTicketsLoading] = useState(false);

  const [categoryOptions, setCategoryOptions] = useState<TicketCategoryDef[]>(
    getTicketCategoriesForRaisedBy(form.raisedByType)
  );

  useEffect(() => {
    void fetch(`/api/public/concerns/categories?raisedByType=${form.raisedByType}`)
      .then((r) => r.json())
      .then((json) => {
        const list = (json.data?.categories ?? []) as TicketCategoryDef[];
        if (list.length) {
          setCategoryOptions(list);
          setForm((f) =>
            list.some((c) => c.value === f.category)
              ? f
              : { ...f, category: list[0]?.value ?? "other" }
          );
          return;
        }
        const fallback = getTicketCategoriesForRaisedBy(form.raisedByType);
        setCategoryOptions(fallback);
        setForm((f) =>
          fallback.some((c) => c.value === f.category)
            ? f
            : { ...f, category: fallback[0]?.value ?? "other" }
        );
      })
      .catch(() => {
        setCategoryOptions(getTicketCategoriesForRaisedBy(form.raisedByType));
      });
  }, [form.raisedByType]);

  useEffect(() => {
    const digits = form.phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setOpenTickets([]);
      setSelectedTicketId("");
      return;
    }
    const t = setTimeout(() => {
      setOpenTicketsLoading(true);
      void fetch(`/api/public/concerns/open-tickets?phone=${encodeURIComponent(form.phone)}`)
        .then((r) => r.json())
        .then((json) => {
          setOpenTickets(json.data?.tickets ?? []);
          setOpenTicketsLoading(false);
        })
        .catch(() => setOpenTicketsLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [form.phone]);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    setFiles((prev) => {
      const merged = [...prev];
      for (const file of Array.from(incoming)) {
        if (merged.length >= MAX_INTAKE_ATTACHMENTS) break;
        if (file.size > MAX_TICKET_ATTACHMENT_BYTES) continue;
        merged.push(file);
      }
      return merged;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("name", form.name);
    formData.append("phone", form.phone);
    formData.append("email", form.email);
    formData.append("category", form.category);
    formData.append("complaint", form.complaint);
    formData.append("raisedByType", form.raisedByType);
    if (selectedTicketId) formData.append("ticketId", selectedTicketId);
    for (const file of files) {
      formData.append("files", file);
    }

    const res = await fetch("/api/public/concerns", { method: "POST", body: formData });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Submission failed");
      return;
    }

    setDone(json.data as SubmitResult);
  };

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);

    const res = await fetch("/api/public/concerns/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketNumber: lookupTicket.trim(),
        phone: lookupPhone.trim(),
      }),
    });

    const json = await res.json();
    setLookupLoading(false);

    if (!res.ok) {
      setLookupError(json.error ?? "Lookup failed");
      return;
    }

    setLookupResult(json.data as LookupResult);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-neutral-100">
        <SupportHeader />
        <div className="mx-auto max-w-lg px-4 py-12">
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">
              ✓
            </div>
            <h1 className="text-xl font-semibold text-neutral-900">Thank you</h1>
            <p className="mt-3 text-sm text-neutral-600">
              Reference:{" "}
              <strong className="font-mono text-lg text-amber-700">{done.ticketNumber}</strong>
            </p>
            <p className="mt-2 text-sm text-neutral-500">{done.message}</p>
            {done.ackSent && (
              <p className="mt-2 text-sm text-green-700">
                Confirmation email sent with your ticket number.
              </p>
            )}
            {done.attachmentsSaved != null && done.attachmentsSaved > 0 && (
              <p className="mt-1 text-sm text-neutral-500">
                {done.attachmentsSaved} file(s) uploaded.
              </p>
            )}
            <Button
              className="mt-6 bg-amber-600 hover:bg-amber-500"
              onClick={() => {
                setDone(null);
                setTab("track");
                setLookupTicket(done.ticketNumber);
                setLookupPhone(form.phone);
              }}
            >
              Track this ticket
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <SupportHeader />

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
        <div className="mb-6 flex rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${
                tab === id
                  ? "bg-black text-white shadow"
                  : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "chat" && (
          <div className="space-y-4">
            <SupportCareChat />
            <p className="text-center text-sm text-neutral-600">
              New to Olready?{" "}
              <button
                type="button"
                onClick={() => setTab("interest")}
                className="font-medium text-amber-700 underline"
              >
                Share your details for a callback
              </button>
            </p>
            <p className="text-center text-xs text-neutral-500">
              Need personal help? Call {CARE_PHONE_DISPLAY} or email{" "}
              <a href={`mailto:${CARE_EMAIL}`} className="text-amber-700 underline">
                {CARE_EMAIL}
              </a>
            </p>
          </div>
        )}

        {tab === "interest" && <SupportInterestForm />}

        {tab === "submit" && (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Submit a concern</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Our care team responds from {CARE_EMAIL}. Attach proof if helpful.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Your name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                label="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="10-digit mobile"
                required
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Recommended — auto confirmation with ticket number"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="I am a"
                value={form.raisedByType}
                onChange={(e) => {
                  const raisedByType = e.target.value;
                  const nextCategories = getTicketCategoriesForRaisedBy(raisedByType);
                  setForm({
                    ...form,
                    raisedByType,
                    category: nextCategories[0]?.value ?? "other",
                  });
                }}
                options={[
                  { value: "mua", label: "MUA / makeup artist" },
                  { value: "bride", label: "Bride / lead" },
                  { value: "other", label: "Other" },
                ]}
              />
              <Select
                label="Category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                options={categoryOptions.map((c) => ({ value: c.value, label: c.label }))}
              />
            </div>

            {openTicketsLoading && (
              <p className="text-xs text-neutral-500">Checking for open tickets on this number…</p>
            )}

            {openTickets.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-950">
                  You have open ticket{openTickets.length === 1 ? "" : "s"} — add an update instead
                  of opening a duplicate?
                </p>
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="ticketMode"
                      checked={!selectedTicketId}
                      onChange={() => setSelectedTicketId("")}
                    />
                    Create a new ticket
                  </label>
                  {openTickets.map((t) => (
                    <label key={t.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="ticketMode"
                        checked={selectedTicketId === t.id}
                        onChange={() => setSelectedTicketId(t.id)}
                      />
                      <span>
                        <strong>{t.ticketNumber}</strong>
                        <span className="ml-2 text-neutral-600">
                          {t.category.replace(/_/g, " ")} · {formatDate(t.createdAt)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                {selectedTicketId ? "What's new on this ticket?" : "Describe your concern"}
              </label>
              <textarea
                className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                rows={5}
                value={form.complaint}
                onChange={(e) => setForm({ ...form, complaint: e.target.value })}
                required
                minLength={10}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Attachments (optional)
              </label>
              <p className="mb-2 text-xs text-neutral-500">
                Up to {MAX_INTAKE_ATTACHMENTS} files, 10 MB each
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={TICKET_ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={files.length >= MAX_INTAKE_ATTACHMENTS}
                onClick={() => fileInputRef.current?.click()}
              >
                Add files
              </Button>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                  {files.map((f) => (
                    <li key={`${f.name}-${f.size}`} className="flex justify-between gap-2">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500">
              {loading ? "Submitting…" : "Submit concern"}
            </Button>
          </form>
        )}

        {tab === "track" && (
          <form
            onSubmit={lookup}
            className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Track your ticket</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Enter the phone number used when submitting and your ticket reference.
              </p>
            </div>
            <Input
              label="Ticket reference"
              value={lookupTicket}
              onChange={(e) => setLookupTicket(e.target.value)}
              placeholder="GK-0001"
              required
            />
            <Input
              label="Phone"
              value={lookupPhone}
              onChange={(e) => setLookupPhone(e.target.value)}
              placeholder="10-digit mobile"
              required
            />
            {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
            {lookupResult && (
              <div className="space-y-4">
                <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Ticket details
                  </p>
                  <p className="mt-1 font-mono text-lg font-semibold text-neutral-900">
                    {lookupResult.ticketNumber}
                  </p>
                  <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-neutral-500">Status</dt>
                      <dd className="mt-0.5 font-medium text-neutral-900">
                        {lookupResult.statusLabel}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Category</dt>
                      <dd className="mt-0.5 text-neutral-900">{lookupResult.category}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Submitted</dt>
                      <dd className="mt-0.5 text-neutral-700">
                        {formatDate(lookupResult.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutral-500">Last updated</dt>
                      <dd className="mt-0.5 text-neutral-700">
                        {formatDate(lookupResult.updatedAt)}
                      </dd>
                    </div>
                  </dl>
                  {lookupResult.nextStep && (
                    <p className="mt-4 border-t border-neutral-100 pt-4 text-neutral-600">
                      {lookupResult.nextStep}
                    </p>
                  )}
                </div>

                {lookupResult.activity && lookupResult.activity.length > 0 && (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm">
                    <p className="font-medium text-neutral-900">Updates</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Chronological progress on your case
                    </p>
                    <ol className="mt-4 space-y-0">
                      {lookupResult.activity.map((item, index) => (
                        <li
                          key={`${item.at}-${item.label}-${index}`}
                          className="relative border-l border-neutral-300 pb-4 pl-5 last:pb-0"
                        >
                          <span
                            className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-neutral-400"
                            aria-hidden
                          />
                          <p className="text-neutral-800">{item.label}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">
                            {formatDateTime(item.at)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
            <Button type="submit" disabled={lookupLoading} className="w-full bg-black hover:bg-neutral-800">
              {lookupLoading ? "Looking up…" : "Check status"}
            </Button>
          </form>
        )}
      </main>

      <footer className="border-t border-neutral-200 bg-white py-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <Image
            src="/brand/olready-white-mb.jpg"
            alt="Olready"
            width={140}
            height={60}
            className="h-auto w-[120px] invert"
          />
          <div className="text-sm text-neutral-600">
            <p className="font-medium text-neutral-800">Team Olready Care</p>
            <p>{CARE_PHONE_DISPLAY} · {CARE_EMAIL}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
