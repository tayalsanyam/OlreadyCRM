import Image from "next/image";
import Link from "next/link";
import { CARE_EMAIL, CARE_PHONE, CARE_PHONE_DISPLAY, CARE_WHATSAPP_URL } from "@/lib/care-contact";

export function SupportHeader() {
  return (
    <header className="bg-black px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <Image
          src="/brand/olready-white-mb.jpg"
          alt="Olready — Your Smart Beauty Club"
          width={280}
          height={120}
          priority
          className="h-auto w-[220px] sm:w-[280px]"
        />
        <p className="mt-4 text-sm tracking-wide text-neutral-400">Care &amp; Support Centre</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm">
          <a
            href={`tel:+91${CARE_PHONE}`}
            className="rounded-full border border-amber-600/40 px-4 py-2 text-amber-100 transition hover:bg-amber-600/10"
          >
            {CARE_PHONE_DISPLAY}
          </a>
          <a
            href={`mailto:${CARE_EMAIL}`}
            className="rounded-full border border-neutral-700 px-4 py-2 text-neutral-200 transition hover:border-amber-600/40 hover:text-amber-100"
          >
            {CARE_EMAIL}
          </a>
          <Link
            href={CARE_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-neutral-700 px-4 py-2 text-neutral-200 transition hover:border-green-600/40 hover:text-green-200"
          >
            WhatsApp
          </Link>
        </div>
      </div>
    </header>
  );
}
