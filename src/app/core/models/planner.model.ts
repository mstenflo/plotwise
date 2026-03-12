import { SeedMetadata, SunExposure } from './seed.model';

export type ProjectSeason = 'spring' | 'summer' | 'fall' | 'winter';
export type LayoutObjectType = 'bed' | 'structure' | 'tree';
export type WarningSeverity = 'info' | 'warning' | 'critical';

export interface SoilCondition {
  ph: number;
  drainage: 'poor' | 'moderate' | 'good';
  organicMatterPercent: number;
}

export interface LayoutObjectBase {
  id: string;
  type: LayoutObjectType;
  name: string;
  xInches: number;
  yInches: number;
  widthInches: number;
  heightInches: number;
  rotationDeg: number;
}

export interface BedPlanting {
  seedId: string;
  plantedOnIso: string;
  plantCount: number;
  expectedHarvestPounds: number;
  expectedHarvestDateIso: string;
}

export interface BedLayout extends LayoutObjectBase {
  type: 'bed';
  sunExposure: SunExposure;
  soil: SoilCondition;
  rows: number;
  planting?: BedPlanting;
  lastSeasonFamily?: string;
}

export interface StructureLayout extends LayoutObjectBase {
  type: 'structure';
}

export interface TreeLayout extends LayoutObjectBase {
  type: 'tree';
  canopyDiameterInches: number;
}

export type LayoutObject = BedLayout | StructureLayout | TreeLayout;

export interface PlannerTask {
  id: string;
  title: string;
  dueDateIso: string;
  bedId: string;
  priority: WarningSeverity;
  completed: boolean;
}

export interface PlannerWarning {
  id: string;
  title: string;
  detail: string;
  severity: WarningSeverity;
  bedId?: string;
}

export interface GardenProject {
  id: string;
  name: string;
  season: ProjectSeason;
  climateZone: string;
  lastFrostDateIso: string;
  firstFrostDateIso: string;
  seeds: SeedMetadata[];
  objects: LayoutObject[];
  completedTaskIds?: string[];
  archivedAtIso?: string;
  updatedAtIso: string;
}

export interface BedGeometryUpdate {
  bedId: string;
  xInches: number;
  yInches: number;
  widthInches: number;
  heightInches: number;
  rotationDeg: number;
}
