import type postgres from "postgres";
import { sql } from "@/db/index";
import { mapMakeupLookRow, type MakeupLookProfileInput } from "@/lib/makeup-look";

type Sql = postgres.Sql<Record<string, unknown>>;

export async function getMakeupLookProfile(
  sql: Sql,
  leadId: string,
): Promise<MakeupLookProfileInput | null> {
  const [row] = await sql<Record<string, unknown>[]>`
    SELECT
      makeup_look_category AS "makeupLookCategory",
      makeup_technique_preference AS "makeupTechniquePreference",
      base_coverage_preference AS "baseCoveragePreference",
      finish_preference AS "finishPreference",
      makeup_intensity AS "makeupIntensity",
      skin_visibility_comfort AS "skinVisibilityComfort",
      eye_look_preference AS "eyeLookPreference",
      lash_preference AS "lashPreference",
      lip_shade_preference AS "lipShadePreference",
      lip_finish_preference AS "lipFinishPreference",
      feature_emphasis AS "featureEmphasis",
      reference_source AS "referenceSource",
      reference_images_uploaded AS "referenceImagesUploaded",
      look_clarity AS "lookClarity",
      look_notes AS "lookNotes",
      same_look_all_events AS "sameLookAllEvents",
      per_event_looks AS "perEventLooks"
    FROM bride_makeup_look_profiles
    WHERE lead_id = ${leadId}::uuid
    LIMIT 1
  `;
  return row ? mapMakeupLookRow(row) : null;
}

export async function upsertMakeupLookProfile(
  tx: Sql,
  leadId: string,
  input: MakeupLookProfileInput,
): Promise<void> {
  await tx`
    INSERT INTO bride_makeup_look_profiles (
      lead_id,
      makeup_look_category,
      makeup_technique_preference,
      base_coverage_preference,
      finish_preference,
      makeup_intensity,
      skin_visibility_comfort,
      eye_look_preference,
      lash_preference,
      lip_shade_preference,
      lip_finish_preference,
      feature_emphasis,
      reference_source,
      reference_images_uploaded,
      look_clarity,
      look_notes,
      same_look_all_events,
      per_event_looks
    ) VALUES (
      ${leadId}::uuid,
      ${input.makeupLookCategory ?? []}::text[],
      ${input.makeupTechniquePreference ?? []}::text[],
      ${input.baseCoveragePreference ?? null},
      ${input.finishPreference ?? []}::text[],
      ${input.makeupIntensity ?? null},
      ${input.skinVisibilityComfort ?? null},
      ${input.eyeLookPreference ?? []}::text[],
      ${input.lashPreference ?? null},
      ${input.lipShadePreference ?? []}::text[],
      ${input.lipFinishPreference ?? null},
      ${input.featureEmphasis ?? []}::text[],
      ${input.referenceSource ?? []}::text[],
      ${input.referenceImagesUploaded ?? false},
      ${input.lookClarity ?? null},
      ${input.lookNotes?.trim() || null},
      ${input.sameLookAllEvents !== false},
      ${sql.json(input.perEventLooks ?? {})}
    )
    ON CONFLICT (lead_id) DO UPDATE SET
      makeup_look_category = EXCLUDED.makeup_look_category,
      makeup_technique_preference = EXCLUDED.makeup_technique_preference,
      base_coverage_preference = EXCLUDED.base_coverage_preference,
      finish_preference = EXCLUDED.finish_preference,
      makeup_intensity = EXCLUDED.makeup_intensity,
      skin_visibility_comfort = EXCLUDED.skin_visibility_comfort,
      eye_look_preference = EXCLUDED.eye_look_preference,
      lash_preference = EXCLUDED.lash_preference,
      lip_shade_preference = EXCLUDED.lip_shade_preference,
      lip_finish_preference = EXCLUDED.lip_finish_preference,
      feature_emphasis = EXCLUDED.feature_emphasis,
      reference_source = EXCLUDED.reference_source,
      reference_images_uploaded = EXCLUDED.reference_images_uploaded,
      look_clarity = EXCLUDED.look_clarity,
      look_notes = EXCLUDED.look_notes,
      same_look_all_events = EXCLUDED.same_look_all_events,
      per_event_looks = EXCLUDED.per_event_looks,
      updated_at = NOW()
  `;
}
