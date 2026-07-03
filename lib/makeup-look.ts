export type MakeupLookOption = { value: string; label: string };

export type MakeupLookProfileInput = {
  makeupLookCategory?: string[];
  makeupTechniquePreference?: string[];
  baseCoveragePreference?: string | null;
  finishPreference?: string[];
  makeupIntensity?: string | null;
  skinVisibilityComfort?: string | null;
  eyeLookPreference?: string[];
  lashPreference?: string | null;
  lipShadePreference?: string[];
  lipFinishPreference?: string | null;
  featureEmphasis?: string[];
  referenceSource?: string[];
  referenceImagesUploaded?: boolean;
  lookClarity?: string | null;
  lookNotes?: string | null;
  sameLookAllEvents?: boolean;
  /** Key = lead event id or ceremony name (before events exist). */
  perEventLooks?: Record<string, MakeupLookEventInput>;
};

/** Subset stored per ceremony when looks differ by event. */
export type MakeupLookEventInput = Pick<
  MakeupLookProfileInput,
  | "makeupLookCategory"
  | "makeupTechniquePreference"
  | "baseCoveragePreference"
  | "finishPreference"
  | "makeupIntensity"
  | "skinVisibilityComfort"
  | "lookClarity"
  | "lookNotes"
>;

export const EMPTY_MAKEUP_EVENT: MakeupLookEventInput = {
  makeupLookCategory: [],
  makeupTechniquePreference: [],
  baseCoveragePreference: null,
  finishPreference: [],
  makeupIntensity: null,
  skinVisibilityComfort: null,
  lookClarity: null,
  lookNotes: null,
};

export const MAKEUP_LOOK_CATEGORY: MakeupLookOption[] = [
  { value: "natural", label: "Natural" },
  { value: "soft_glam", label: "Soft Glam" },
  { value: "full_glam", label: "Full Glam" },
  { value: "traditional_bridal", label: "Traditional Bridal" },
  { value: "modern_bridal", label: "Modern Bridal" },
  { value: "royal_bridal", label: "Royal Bridal" },
  { value: "minimal_bridal", label: "Minimal Bridal" },
  { value: "celebrity_inspired", label: "Celebrity Inspired" },
  { value: "party_glam", label: "Party Glam" },
  { value: "editorial_bold", label: "Editorial / Bold" },
  { value: "not_sure", label: "Not Sure" },
];

export const MAKEUP_TECHNIQUE: MakeupLookOption[] = [
  { value: "hd_makeup", label: "HD Makeup" },
  { value: "airbrush_makeup", label: "Airbrush Makeup" },
  { value: "ultra_hd_makeup", label: "Ultra HD Makeup" },
  { value: "regular_bridal_makeup", label: "Regular Bridal Makeup" },
  { value: "waterproof_longwear", label: "Waterproof / Long-wear" },
  { value: "artist_recommended", label: "Artist Recommended" },
  { value: "not_sure", label: "Not Sure" },
];

export const BASE_COVERAGE: MakeupLookOption[] = [
  { value: "sheer", label: "Sheer / Very Light" },
  { value: "light", label: "Light Coverage" },
  { value: "medium", label: "Medium Coverage" },
  { value: "buildable", label: "Buildable Coverage" },
  { value: "full", label: "Full Coverage" },
  { value: "flawless_camera", label: "Flawless Camera Finish" },
  { value: "not_sure", label: "Not Sure" },
];

export const FINISH_PREFERENCE: MakeupLookOption[] = [
  { value: "dewy", label: "Dewy" },
  { value: "glowy", label: "Glowy" },
  { value: "matte", label: "Matte" },
  { value: "soft_matte", label: "Soft Matte" },
  { value: "skin_like", label: "Skin-like" },
  { value: "luminous", label: "Luminous" },
  { value: "satin", label: "Satin Finish" },
  { value: "longwear", label: "Long-wear" },
  { value: "not_sure", label: "Not Sure" },
];

export const MAKEUP_INTENSITY: MakeupLookOption[] = [
  { value: "very_light", label: "Very Light" },
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High Glam" },
  { value: "heavy_bridal", label: "Heavy Bridal" },
  { value: "not_sure", label: "Not Sure" },
];

export const SKIN_VISIBILITY: MakeupLookOption[] = [
  { value: "natural_skin_visible", label: "Natural skin visible" },
  { value: "some_coverage_ok", label: "Comfortable with some coverage" },
  { value: "hide_marks_texture", label: "Hide marks/texture" },
  { value: "full_flawless", label: "Fully flawless finish" },
  { value: "not_sure", label: "Not Sure" },
];

export const EYE_LOOK: MakeupLookOption[] = [
  { value: "natural_eyes", label: "Natural Eyes" },
  { value: "soft_eyes", label: "Soft Eyes" },
  { value: "smokey_eyes", label: "Smokey Eyes" },
  { value: "brown_smokey", label: "Brown Smokey" },
  { value: "glitter_eyes", label: "Glitter Eyes" },
  { value: "shimmer_eyes", label: "Shimmer Eyes" },
  { value: "cut_crease", label: "Cut Crease" },
  { value: "winged_liner", label: "Winged Liner" },
  { value: "kohl_heavy", label: "Kohl-heavy" },
  { value: "bold_lashes", label: "Bold Lashes" },
  { value: "not_sure", label: "Not Sure" },
];

export const LASH_PREFERENCE: MakeupLookOption[] = [
  { value: "natural_lashes", label: "Natural Lashes" },
  { value: "medium_lashes", label: "Medium Lashes" },
  { value: "dramatic_lashes", label: "Dramatic Lashes" },
  { value: "no_false_lashes", label: "No False Lashes" },
  { value: "artist_recommended", label: "Artist Recommended" },
  { value: "not_sure", label: "Not Sure" },
];

export const LIP_SHADE: MakeupLookOption[] = [
  { value: "nude", label: "Nude" },
  { value: "pink", label: "Pink" },
  { value: "peach", label: "Peach" },
  { value: "brown", label: "Brown" },
  { value: "rose", label: "Rose" },
  { value: "mauve", label: "Mauve" },
  { value: "red", label: "Red" },
  { value: "maroon", label: "Maroon" },
  { value: "wine", label: "Wine" },
  { value: "coral", label: "Coral" },
  { value: "artist_recommended", label: "Artist Recommended" },
  { value: "not_sure", label: "Not Sure" },
];

export const LIP_FINISH: MakeupLookOption[] = [
  { value: "matte", label: "Matte" },
  { value: "glossy", label: "Glossy" },
  { value: "satin", label: "Satin" },
  { value: "longwear", label: "Long-wear" },
  { value: "not_sure", label: "Not Sure" },
];

export const FEATURE_EMPHASIS: MakeupLookOption[] = [
  { value: "eyes", label: "Eyes" },
  { value: "skin_base", label: "Skin/Base" },
  { value: "lips", label: "Lips" },
  { value: "contour", label: "Contour" },
  { value: "blush", label: "Blush" },
  { value: "highlight", label: "Highlight" },
  { value: "balanced", label: "Balanced Overall Look" },
  { value: "not_sure", label: "Not Sure" },
];

export const REFERENCE_SOURCE: MakeupLookOption[] = [
  { value: "instagram", label: "Instagram" },
  { value: "pinterest", label: "Pinterest" },
  { value: "celebrity", label: "Celebrity Look" },
  { value: "artist_portfolio", label: "Artist Portfolio" },
  { value: "friend_family", label: "Friend/Family Reference" },
  { value: "none", label: "No Reference" },
  { value: "will_share_later", label: "Will Share Later" },
];

export const LOOK_CLARITY: MakeupLookOption[] = [
  { value: "very_clear", label: "Very Clear" },
  { value: "somewhat_clear", label: "Somewhat Clear" },
  { value: "confused", label: "Confused" },
  { value: "needs_guidance", label: "Needs Guidance" },
];

export const EMPTY_MAKEUP_LOOK: MakeupLookProfileInput = {
  makeupLookCategory: [],
  makeupTechniquePreference: [],
  baseCoveragePreference: null,
  finishPreference: [],
  makeupIntensity: null,
  skinVisibilityComfort: null,
  eyeLookPreference: [],
  lashPreference: null,
  lipShadePreference: [],
  lipFinishPreference: null,
  featureEmphasis: [],
  referenceSource: [],
  referenceImagesUploaded: false,
  lookClarity: null,
  lookNotes: null,
  sameLookAllEvents: true,
  perEventLooks: {},
};

function labelFor(options: MakeupLookOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function labelList(options: MakeupLookOption[], values: string[] | undefined): string {
  if (!values?.length) return "";
  return values.map((v) => labelFor(options, v)).join(", ");
}

/** Plain-text summary for RM AI assist prompts. */
export function formatMakeupLookForAi(value: MakeupLookProfileInput): string {
  const lines: string[] = [];
  const cats = labelList(MAKEUP_LOOK_CATEGORY, value.makeupLookCategory);
  if (cats) lines.push(`Look category: ${cats}`);
  const tech = labelList(MAKEUP_TECHNIQUE, value.makeupTechniquePreference);
  if (tech) lines.push(`Technique: ${tech}`);
  if (value.baseCoveragePreference) {
    lines.push(`Coverage: ${labelFor(BASE_COVERAGE, value.baseCoveragePreference)}`);
  }
  if (value.makeupIntensity) {
    lines.push(`Intensity: ${labelFor(MAKEUP_INTENSITY, value.makeupIntensity)}`);
  }
  const finish = labelList(FINISH_PREFERENCE, value.finishPreference);
  if (finish) lines.push(`Finish: ${finish}`);
  if (value.skinVisibilityComfort) {
    lines.push(`Skin visibility: ${labelFor(SKIN_VISIBILITY, value.skinVisibilityComfort)}`);
  }
  if (value.lookClarity) {
    lines.push(`Look clarity: ${labelFor(LOOK_CLARITY, value.lookClarity)}`);
  }
  const refSrc = labelList(REFERENCE_SOURCE, value.referenceSource);
  if (refSrc) lines.push(`Reference source: ${refSrc}`);
  if (value.referenceImagesUploaded) lines.push("Reference images: uploaded");
  if (value.lookNotes?.trim()) lines.push(`Look notes: ${value.lookNotes.trim()}`);
  if (value.sameLookAllEvents === false) {
    const per = value.perEventLooks ?? {};
    const keys = Object.keys(per);
    if (keys.length) lines.push(`Different look per event (${keys.length} configured)`);
    else lines.push("Different look per event (not yet filled)");
  }
  return lines.join("\n");
}

export function summarizeMakeupLook(value: MakeupLookProfileInput): string {
  const cats = value.makeupLookCategory ?? [];
  if (cats.length) {
    const label = MAKEUP_LOOK_CATEGORY.find((o) => o.value === cats[0])?.label ?? cats[0];
    return cats.length > 1 ? `${label} +${cats.length - 1}` : label;
  }
  if (value.makeupIntensity) {
    return MAKEUP_INTENSITY.find((o) => o.value === value.makeupIntensity)?.label ?? value.makeupIntensity;
  }
  if (value.sameLookAllEvents === false) return "Different per event";
  return "";
}

export function mapMakeupLookRow(row: Record<string, unknown> | null | undefined): MakeupLookProfileInput {
  if (!row) return { ...EMPTY_MAKEUP_LOOK };
  return {
    makeupLookCategory: (row.makeupLookCategory as string[]) ?? [],
    makeupTechniquePreference: (row.makeupTechniquePreference as string[]) ?? [],
    baseCoveragePreference: (row.baseCoveragePreference as string | null) ?? null,
    finishPreference: (row.finishPreference as string[]) ?? [],
    makeupIntensity: (row.makeupIntensity as string | null) ?? null,
    skinVisibilityComfort: (row.skinVisibilityComfort as string | null) ?? null,
    eyeLookPreference: (row.eyeLookPreference as string[]) ?? [],
    lashPreference: (row.lashPreference as string | null) ?? null,
    lipShadePreference: (row.lipShadePreference as string[]) ?? [],
    lipFinishPreference: (row.lipFinishPreference as string | null) ?? null,
    featureEmphasis: (row.featureEmphasis as string[]) ?? [],
    referenceSource: (row.referenceSource as string[]) ?? [],
    referenceImagesUploaded: Boolean(row.referenceImagesUploaded),
    lookClarity: (row.lookClarity as string | null) ?? null,
    lookNotes: (row.lookNotes as string | null) ?? null,
    sameLookAllEvents: row.sameLookAllEvents !== false,
    perEventLooks: (row.perEventLooks as Record<string, MakeupLookEventInput>) ?? {},
  };
}
