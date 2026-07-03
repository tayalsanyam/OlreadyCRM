export interface RmOption {
  id: string;
  name: string;
  region: string;
  regions?: string[];
}

export interface CommissionRmOption {
  id: string;
  name: string;
}

export function rmMatchesRegion(r: RmOption, leadRegion: string | null) {
  if (!leadRegion) return false;
  const regions = r.regions?.length ? r.regions : [r.region];
  return regions.includes(leadRegion);
}
