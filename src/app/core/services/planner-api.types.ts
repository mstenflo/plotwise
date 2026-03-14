import {
  BedDetails,
  BedPlacement,
  BedPlacementMode,
  BedSummary,
  BedZone,
  PlannerTask,
} from '../models/planner.model';

export interface CreateProjectRequest {
  name: string;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  climateZone: string;
  lastFrostDateIso: string;
  firstFrostDateIso: string;
}

export interface CreatePlacementRequest {
  seedId: string;
  plantedOnIso: string;
  plantCount: number;
  colorHex: string;
  placementMode: BedPlacementMode;
  polygonPoints: BedPlacement['polygonPoints'];
}

export interface UpdateBedDetailsRequest {
  name?: string;
  rows?: number;
  sunExposure?: 'full-sun' | 'part-sun' | 'shade';
  soil?: {
    ph: number;
    drainage: 'poor' | 'moderate' | 'good';
    organicMatterPercent: number;
  };
  lastSeasonFamily?: string;
  zones?: BedZone[];
}

export interface HarvestPreviewRequest {
  seedId: string;
  plantedOnIso: string;
  plantCount: number;
}

export interface HarvestPreviewResponse {
  expectedHarvestDateIso: string;
  expectedHarvestPounds: number;
}

export interface TaskQueryParams {
  bedId?: string;
  placementId?: string;
  completed?: boolean;
}

export type BedDetailsResponse = BedDetails;
export type BedSummaryResponse = BedSummary;
export type BedPlacementResponse = BedPlacement;
export type PlannerTaskResponse = PlannerTask;
