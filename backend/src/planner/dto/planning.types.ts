import type { BedLayout, BedPlacementMode, PlacementPoint, SeedMetadata, SunExposure } from '../models/planner.types';

export interface PlantingRecord {
  id: string;
  projectId: string;
  bedId: string;
  seedId: string;
  plantedOnIso: string;
  plantCount: number;
  expectedHarvestPounds: number;
  expectedHarvestDateIso: string;
  colorHex: string;
  placementMode: BedPlacementMode;
  polygonPoints: PlacementPoint[];
  legacyZoneId?: string;
  updatedAtIso: string;
}

export interface CalendarTaskRecord {
  id: string;
  projectId: string;
  bedId: string;
  title: string;
  dueDateIso: string;
  priority: 'info' | 'warning' | 'critical';
  completed: boolean;
  plantingId?: string;
  placementId?: string;
  taskType?: 'harvest' | 'succession' | 'maintenance';
  updatedAtIso: string;
}

export interface BedSummaryPlantRecord {
  seedId: string;
  name: string;
  variety: string;
  plantCount: number;
  expectedHarvestPounds: number;
  placementCount: number;
  colorHex?: string;
  nextHarvestDateIso?: string;
}

export interface PlannerWarningRecord {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  bedId?: string;
  placementId?: string;
}

export interface BedSummaryRecord {
  bedId: string;
  bedName: string;
  currentPlants: BedSummaryPlantRecord[];
  nextTasks: CalendarTaskRecord[];
  placementsCount: number;
  occupiedAreaSqInches: number;
  openAreaSqInches: number;
  totalAreaSqInches: number;
  warnings: PlannerWarningRecord[];
}

export interface BedDetailsResponse {
  bed: BedLayout;
  placements: PlantingRecord[];
  summary: BedSummaryRecord;
  tasks: CalendarTaskRecord[];
  warnings: PlannerWarningRecord[];
}

export interface HarvestPreviewResponse {
  expectedHarvestDateIso: string;
  expectedHarvestPounds: number;
}

export interface BedSeedHintRecord {
  seedId: string;
  seed?: SeedMetadata;
  preferredSun?: SunExposure;
}
