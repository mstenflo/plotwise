export type CropLifecycle = 'annual' | 'perennial';
export type SunExposure = 'full-sun' | 'part-sun' | 'shade';
export type ProjectSeason = 'spring' | 'summer' | 'fall' | 'winter';
export type LayoutObjectType = 'bed' | 'structure' | 'tree';
export type BedShapeType = 'rectangle' | 'polygon';
export type ZoneShapeType = 'row-strip' | 'square' | 'polygon';
export type BedPlacementMode = 'row-strip' | 'block' | 'polygon';

export interface YieldProfile {
  averagePoundsPerPlant: number;
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

export interface SoilCondition {
  ph: number;
  drainage: 'poor' | 'moderate' | 'good';
  organicMatterPercent: number;
}

export interface ShapePoint {
  xPct: number;
  yPct: number;
}

export interface PlacementPoint {
  xInches: number;
  yInches: number;
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

export interface BedPlacement {
  id: string;
  projectId: string;
  bedId: string;
  seedId: string;
  plantedOnIso: string;
  expectedHarvestDateIso: string;
  plantCount: number;
  expectedHarvestPounds: number;
  colorHex: string;
  placementMode: BedPlacementMode;
  polygonPoints: PlacementPoint[];
  legacyZoneId?: string;
  updatedAtIso: string;
}

export interface BedZone {
  id: string;
  name: string;
  rowIndex: number;
  shapeType?: ZoneShapeType;
  colorHex?: string;
  rect?: {
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
  };
  polygon?: ShapePoint[];
  planting?: BedPlanting;
}

export interface BedLayout extends LayoutObjectBase {
  type: 'bed';
  shapeType?: BedShapeType;
  polygon?: ShapePoint[];
  sunExposure: SunExposure;
  soil: SoilCondition;
  rows: number;
  zones?: BedZone[];
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
