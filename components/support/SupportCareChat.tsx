"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SUPPORT_SUBMIT_CONCERN_PATH } from "@/lib/support-public-links";
import type { CareChatMessage } from "@/lib/care-public-chat";
import type { SupportVisitorKind, SupportVisitorSegment } from "@/lib/support-chat-intake";
import { resolveSupportChatMode } from "@/lib/support-chat-mode";
import { isValidPhone10, PHONE_ERROR } from "@/lib/validation";

const STARTER_PROMPTS_MUA_PROSPECT = [
  "What plans do you offer for makeup artists?",
  "How do bridal leads work on Olready?",
  "I'm a freelancer in Mumbai — is Olready right for me?",
];

const STARTER_PROMPTS_MUA_PARTNER = [
  "How do lead reversals work?",
  "What is included in my plan?",
  "How do I contact my RM?",
];

const STARTER_PROMPTS_BRIDE = [
  "How does Olready help brides find artists?",
  "What should I share for a makeup consultation?",
  "How long until someone responds?",
];

type IntakePhase = "intro" | "chat";

type SessionInfo = {
  sessionId: string;
  segment: SupportVisitorSegment;
  segmentLabel: string;
  greeting: string;
  visitorKind: SupportVisitorKind;
};

export function SupportCareChat() {
  const [phase, setPhase] = useState<IntakePhase>("intro");
  const [visitorKind, setVisitorKind] = useState<SupportVisitorKind | "">("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);

  const [messages, setMessages] = useState<CareChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, phase]);

  const starterPrompts = (() => {
    if (session?.visitorKind === "bride") return STARTER_PROMPTS_BRIDE;
    if (session?.segment && resolveSupportChatMode(session.segment) === "mua_care") {
      return STARTER_PROMPTS_MUA_PARTNER;
    }
    return STARTER_PROMPTS_MUA_PROSPECT;
  })();

  const startChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitorKind) {
      setIntakeError("Please choose MUA or Bride / customer.");
      return;
    }

    if (!name.trim() || name.trim().length < 2) {
      setIntakeError("Please enter your name.");
      return;
    }

    if (!isValidPhone10(phone)) {
      setPhoneError(PHONE_ERROR);
      setIntakeError(null);
      return;
    }

    setIntakeLoading(true);
    setIntakeError(null);
    setPhoneError(null);

    const res = await fetch("/api/public/care-chat/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, visitorKind }),
    });
    const json = await res.json();
    setIntakeLoading(false);

    if (!res.ok) {
      setIntakeError(json.error ?? "Could not start chat");
      return;
    }

    const data = json.data as SessionInfo;
    setSession({
      sessionId: data.sessionId,
      segment: data.segment,
      segmentLabel: data.segmentLabel,
      greeting: data.greeting,
      visitorKind: data.visitorKind,
    });
    setMessages([{ role: "assistant", content: data.greeting }]);
    setPhase("chat");
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || loading || !session?.sessionId) return;

    setError(null);
    setInput("");
    const nextMessages: CareChatMessage[] = [...messages, { role: "user", content: message }];
    setMessages(nextMessages);
    setLoading(true);

    const res = await fetch("/api/public/care-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sessionId: session.sessionId,
        history: nextMessages.slice(0, -1),
      }),
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Something went wrong");
      return;
    }

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: json.data.reply as string },
    ]);
  };

  if (phase === "intro") {
    return (
      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl">
        <div className="border-b border-neutral-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Start a conversation</h2>
          <p className="mt-1 text-sm text-neutral-400">
            A quick intro helps us tailor answers and route you to the right team if needed.
          </p>
        </div>

        <form onSubmit={startChat} className="space-y-4 p-5">
          <div>
            <p className="mb-2 text-sm font-medium text-neutral-200">I am a…</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setVisitorKind("mua")}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  visitorKind === "mua"
                    ? "border-amber-600 bg-amber-600/10 text-amber-100"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-600"
                }`}
              >
                <span className="font-medium">Makeup artist (MUA)</span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  Partner, prospect, or exploring Olready
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVisitorKind("bride")}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  visitorKind === "bride"
                    ? "border-amber-600 bg-amber-600/10 text-amber-100"
                    : "border-neutral-700 text-neutral-300 hover:border-neutral-600"
                }`}
              >
                <span className="font-medium">Bride / customer</span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  Planning makeup for an event
                </span>
              </button>
            </div>
          </div>

          <Input
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            labelClassName="text-white"
            className="border-neutral-700 bg-neutral-900 !text-white placeholder:text-neutral-500 focus:border-amber-600 focus:ring-amber-600"
          />
          <Input
            label="Mobile number"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (phoneError) setPhoneError(null);
            }}
            placeholder="10-digit mobile"
            inputMode="numeric"
            autoComplete="tel"
            required
            error={phoneError ?? undefined}
            labelClassName="text-white"
            wrapperClassName="[&_span]:text-red-400"
            className="border-neutral-700 bg-neutral-900 !text-white placeholder:text-neutral-500 focus:border-amber-600 focus:ring-amber-600"
          />

          {intakeError && <p className="text-sm text-red-400">{intakeError}</p>}

          <Button
            type="submit"
            disabled={intakeLoading}
            className="w-full bg-amber-600 hover:bg-amber-500"
          >
            {intakeLoading ? "Starting…" : "Continue to chat"}
          </Button>

          <p className="text-[11px] text-neutral-500">
            We use your number only to recognize existing MUAs/brides and improve support. For formal
            complaints,{" "}
            <Link href={SUPPORT_SUBMIT_CONCERN_PATH} className="text-amber-400 underline">
              submit a concern
            </Link>{" "}
            after chatting.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-[min(520px,70vh)] flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-xl">
      {session && (
        <div className="border-b border-neutral-800 px-4 py-2.5 text-xs text-neutral-400">
          {session.segmentLabel} · {name}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap sm:max-w-[80%] ${
                m.role === "user"
                  ? "bg-amber-600/90 text-white"
                  : "border border-neutral-800 bg-neutral-900 text-neutral-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 border-t border-neutral-800 px-4 py-3">
          {starterPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => void send(prompt)}
              className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-amber-600/50 hover:text-amber-200"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form
        className="border-t border-neutral-800 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <p className="mb-2 text-[11px] text-neutral-500">
          Need to report an issue?{" "}
          <Link href={SUPPORT_SUBMIT_CONCERN_PATH} className="text-amber-400 underline">
            Submit a concern
          </Link>
        </p>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about plans, leads, policies…"
            className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white placeholder:text-neutral-500 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
            maxLength={2000}
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 bg-amber-600 hover:bg-amber-500"
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
