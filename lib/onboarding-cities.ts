import {
  expandBundleIntoCities,
  normalizeCityList,
  shouldDropStatePlaceholderCity,
} from "@/lib/geo-bundles";

/**
 * Persist canonical city names — expand bundles, drop state-name placeholders
 * except homonym UT cities (Delhi, Chandigarh, Goa, Puducherry).
 */
export function normalizeOnboardingCities(cities: string[], states: string[] = []): string[] {
  const filtered = cities.filter((raw) => {
    const city = raw.trim();
    if (!city) return false;
    return !shouldDropStatePlaceholderCity(city, states);
  });
  return normalizeCityList(expandBundleIntoCities(filtered));
}
