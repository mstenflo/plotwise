export type CropLifecycle = 'annual' | 'perennial';
export type SunExposure = 'full-sun' | 'part-sun' | 'shade';

export interface YieldProfile {
  averagePoundsPerPlant: number;
  averageUnitsPerPlant?: number;
}

export interface SeedMetadata {
  id: string;
  name: string;
  variety: string;
  lifecycle: CropLifecycle;
  family: string;
  spacingInches: number;
  rowSpacingInches: number;
  daysToMaturity: number;
  matureSpreadInches: number;
  preferredSun: SunExposure;
  soilPhMin: number;
  soilPhMax: number;
  successionFriendly: boolean;
  notes?: string;
  yield: YieldProfile;
  companionSeedIds?: string[];
  conflictSeedIds?: string[];
}
