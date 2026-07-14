"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { isValidPhone10, PHONE_ERROR } from "@/lib/validation";

type Props = {
  onSubmitted?: () => void;
};

export function SupportInterestForm({ onSubmitted }: Props) {
  const [visitorKind, setVisitorKind] = useState<"mua" | "bride" | "">("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [message, setMessage] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ reference: string | null; message: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorKind) {
      setError("Please choose whether you are an MUA or a bride.");
      return;
    }
    if (!isValidPhone10(phone)) {
      setPhoneError(PHONE_ERROR);
      return;
    }

    setLoading(true);
    setError(null);
    setPhoneError(null);

    const res = await fetch("/api/public/support/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, visitorKind, email, city, message }),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Could not submit");
      return;
    }

    setDone(json.data);
    onSubmitted?.();
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">We&apos;ve got your details</h2>
        {done.reference && (
          <p className="mt-2 font-mono text-sm text-amber-700">{done.reference}</p>
        )}
        <p className="mt-3 text-sm text-neutral-600">{done.message}</p>
        <Link href="/support" className="mt-4 inline-block text-sm text-amber-700 underline">
          Back to support
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Interested in Olready?</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Share your details and our team will reach out — no account needed.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setVisitorKind("mua")}
          className={`rounded-xl border px-4 py-3 text-left text-sm ${
            visitorKind === "mua" ? "border-amber-600 bg-amber-50" : "border-neutral-200"
          }`}
        >
          <span className="font-medium">I&apos;m a makeup artist</span>
          <span className="mt-0.5 block text-xs text-neutral-500">Partner / join Olready</span>
        </button>
        <button
          type="button"
          onClick={() => setVisitorKind("bride")}
          className={`rounded-xl border px-4 py-3 text-left text-sm ${
            visitorKind === "bride" ? "border-amber-600 bg-amber-50" : "border-neutral-200"
          }`}
        >
          <span className="font-medium">I&apos;m planning an event</span>
          <span className="mt-0.5 block text-xs text-neutral-500">Bride / customer enquiry</span>
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input
          label="Mobile number"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            if (phoneError) setPhoneError(null);
          }}
          placeholder="10-digit mobile"
          inputMode="numeric"
          required
          error={phoneError ?? undefined}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Email (optional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input label="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          What are you looking for?
        </label>
        <textarea
          className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={5}
          placeholder="e.g. Want to know MUA plans in Mumbai / Need bridal makeup for December wedding"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-500">
        {loading ? "Submitting…" : "Send my details"}
      </Button>
    </form>
  );
}
