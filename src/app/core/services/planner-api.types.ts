export interface CreateProjectRequest {
  name: string;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  climateZone: string;
  lastFrostDateIso: string;
  firstFrostDateIso: string;
}
