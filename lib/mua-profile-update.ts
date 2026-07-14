import { type TransactionSql } from "@/db/index";
import {
  normalizeServiceOfferings,
  serviceNamesFromOfferings,
  type MuaServiceOffering,
} from "@/lib/mua-service-catalog";
import { lookupRegionsForCity } from "@/lib/mua-city-region";
import { resolveMuaRegions } from "@/lib/mua-region";
import { syncMuaRegions } from "@/lib/mua-regions-db";
import type { Region } from "@/lib/types";

export type MuaProfileFields = {
  phone?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  specialties?: string[];
  services?: string[];
  serviceOfferings?: MuaServiceOffering[];
  bio?: string | null;
  regions?: Region[];
  city?: string;
  businessName?: string | null;
  officialAddress?: string | null;
  gstNumber?: string | null;
  email?: string | null;
  alternatePhone?: string | null;
  businessManagerPhone?: string | null;
  avgRevenueTarget?: number | null;
  preferredContactChannel?: string | null;
  source?: string | null;
  name?: string;
  status?: string;
};

function normPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? digits : null;
}

/** Unchanged column in partial UPDATE — use tx.unsafe, not nested sql`` fragments. */
function keepCol(tx: TransactionSql, column: string) {
  return tx.unsafe(column);
}

export async function applyMuaProfileUpdate(
  tx: TransactionSql,
  muaId: string,
  body: MuaProfileFields,
  opts: { existingCity: string; existingPhone?: string | null }
): Promise<void> {
  const offerings =
    body.serviceOfferings !== undefined
      ? normalizeServiceOfferings(body.serviceOfferings)
      : body.services !== undefined
        ? normalizeServiceOfferings(body.services.map((name) => ({ name })))
        : undefined;

  const phone =
    body.phone !== undefined ? normPhone(body.phone) : undefined;
  const whatsappRaw = body.whatsapp !== undefined ? normPhone(body.whatsapp) : undefined;
  const whatsapp =
    whatsappRaw !== undefined
      ? whatsappRaw ?? (phone !== undefined ? phone : normPhone(opts.existingPhone))
      : undefined;

  await tx`
    UPDATE muas SET
      name = COALESCE(${body.name ?? null}, name),
      phone = ${phone !== undefined ? phone : keepCol(tx, "phone")},
      whatsapp = ${whatsapp !== undefined ? whatsapp : keepCol(tx, "whatsapp")},
      instagram = ${body.instagram !== undefined ? body.instagram : keepCol(tx, "instagram")},
      source = ${body.source !== undefined ? body.source : keepCol(tx, "source")},
      specialties = ${
        body.specialties !== undefined ? body.specialties : keepCol(tx, "specialties")
      },
      services = ${
        offerings !== undefined ? serviceNamesFromOfferings(offerings) : keepCol(tx, "services")
      },
      service_offerings = ${
        offerings !== undefined ? tx.json(offerings) : keepCol(tx, "service_offerings")
      },
      bio = ${body.bio !== undefined ? body.bio : keepCol(tx, "bio")},
      city = ${body.city !== undefined ? body.city : keepCol(tx, "city")},
      business_name = ${
        body.businessName !== undefined ? body.businessName : keepCol(tx, "business_name")
      },
      official_address = ${
        body.officialAddress !== undefined ? body.officialAddress : keepCol(tx, "official_address")
      },
      gst_number = ${body.gstNumber !== undefined ? body.gstNumber : keepCol(tx, "gst_number")},
      email = ${body.email !== undefined ? body.email : keepCol(tx, "email")},
      alternate_phone = ${
        body.alternatePhone !== undefined
          ? normPhone(body.alternatePhone)
          : keepCol(tx, "alternate_phone")
      },
      business_manager_phone = ${
        body.businessManagerPhone !== undefined
          ? normPhone(body.businessManagerPhone)
          : keepCol(tx, "business_manager_phone")
      },
      avg_revenue_target = ${
        body.avgRevenueTarget !== undefined
          ? body.avgRevenueTarget
          : keepCol(tx, "avg_revenue_target")
      },
      preferred_contact_channel = ${
        body.preferredContactChannel !== undefined
          ? body.preferredContactChannel
          : keepCol(tx, "preferred_contact_channel")
      },
      status = ${
        body.status !== undefined
          ? body.status === "inactive"
            ? "inactive"
            : "active"
          : keepCol(tx, "status")
      },
      updated_at = NOW()
    WHERE id = ${muaId}::uuid
  `;

  if (body.regions !== undefined || body.city !== undefined) {
    const city = body.city ?? opts.existingCity;
    let regions = body.regions !== undefined ? resolveMuaRegions(body.regions, city) : [];
    if (!regions.length) {
      regions = await lookupRegionsForCity(tx, city);
    }
    await syncMuaRegions(tx, muaId, regions);
  }
}

export function formatServiceOfferingsSummary(
  offerings: MuaServiceOffering[] | null | undefined
): string {
  if (!offerings?.length) return "—";
  return offerings
    .map((o) =>
      o.baseAmount != null
        ? `${o.name} (₹${o.baseAmount.toLocaleString("en-IN")})`
        : o.name
    )
    .join(" · ");
}

export { MUA_STATUS_LABELS } from "@/lib/mua-status-labels";
