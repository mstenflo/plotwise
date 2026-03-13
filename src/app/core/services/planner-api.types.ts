export interface CreateProjectRequest {
  name: string;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  climateZone: string;
  lastFrostDateIso: string;
  firstFrostDateIso: string;
}

export interface CreatePlantingRequest {
  bedId: string;
  zoneId?: string;
  seedId: string;
  plantedOnIso: string;
  plantCount: number;
  expectedHarvestPounds: number;
  expectedHarvestDateIso: string;
}

export interface TaskQueryParams {
  bedId?: string;
  completed?: boolean;
}
