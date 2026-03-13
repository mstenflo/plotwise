import { SeedMetadata, SunExposure } from './seed.model';

export type ProjectSeason = 'spring' | 'summer' | 'fall' | 'winter';
export type LayoutObjectType = 'bed' | 'structure' | 'tree';
export type WarningSeverity = 'info' | 'warning' | 'critical';
export type CanvasToolMode = 'select' | 'pan' | 'draw-bed' | 'draw-polygon-bed';
export type BedShapeType = 'rectangle' | 'polygon';
export type ZoneShapeType = 'row-strip' | 'square' | 'polygon';

export interface ShapePoint {
  xPct: number;
  yPct: number;
}

export interface BedPolygonDraftPoint {
  xInches: number;
  yInches: number;
}

export interface ZoneRect {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

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

export interface BedZone {
  id: string;
  name: string;
  rowIndex: number;
  shapeType?: ZoneShapeType;
  colorHex?: string;
  rect?: ZoneRect;
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

export interface BedDraftGeometry {
  xInches: number;
  yInches: number;
  widthInches: number;
  heightInches: number;
}
