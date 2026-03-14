import type {
  BedLayout,
  BedPlacement,
  BedPlacementMode,
  BedZone,
  PlacementPoint,
  SeedMetadata,
  ShapePoint,
} from './models/planner.types';

const DEFAULT_PLACEMENT_COLOR = '#7ab77d';

export interface OccupancyMetrics {
  occupiedAreaSqInches: number;
  openAreaSqInches: number;
  totalAreaSqInches: number;
  overlapPairs: Array<[string, string]>;
  placementAreas: Map<string, number>;
}

export function createRectPolygon(
  xInches: number,
  yInches: number,
  widthInches: number,
  heightInches: number,
): PlacementPoint[] {
  return [
    { xInches, yInches },
    { xInches: xInches + widthInches, yInches },
    { xInches: xInches + widthInches, yInches: yInches + heightInches },
    { xInches, yInches: yInches + heightInches },
  ];
}

export function getBedFootprintPolygon(bed: BedLayout): PlacementPoint[] {
  if (bed.shapeType === 'polygon' && Array.isArray(bed.polygon) && bed.polygon.length >= 3) {
    return bed.polygon.map((point) => ({
      xInches: clamp(point.xPct * bed.widthInches, 0, bed.widthInches),
      yInches: clamp(point.yPct * bed.heightInches, 0, bed.heightInches),
    }));
  }

  return createRectPolygon(0, 0, bed.widthInches, bed.heightInches);
}

export function convertShapePointToPlacementPoint(
  point: ShapePoint,
  bed: BedLayout,
): PlacementPoint {
  return {
    xInches: clamp(point.xPct * bed.widthInches, 0, bed.widthInches),
    yInches: clamp(point.yPct * bed.heightInches, 0, bed.heightInches),
  };
}

export function getLegacyZonePlacement(
  bed: BedLayout,
  zone: BedZone,
): {
  placementMode: BedPlacementMode;
  colorHex: string;
  polygonPoints: PlacementPoint[];
} {
  if (zone.shapeType === 'polygon' && Array.isArray(zone.polygon) && zone.polygon.length >= 3) {
    return {
      placementMode: 'polygon',
      colorHex: zone.colorHex ?? DEFAULT_PLACEMENT_COLOR,
      polygonPoints: zone.polygon.map((point) => convertShapePointToPlacementPoint(point, bed)),
    };
  }

  if (zone.shapeType === 'square' && zone.rect) {
    return {
      placementMode: 'block',
      colorHex: zone.colorHex ?? DEFAULT_PLACEMENT_COLOR,
      polygonPoints: createRectPolygon(
        zone.rect.xPct * bed.widthInches,
        zone.rect.yPct * bed.heightInches,
        zone.rect.widthPct * bed.widthInches,
        zone.rect.heightPct * bed.heightInches,
      ),
    };
  }

  const rowCount = Math.max(1, bed.rows || 1);
  const rowHeight = bed.heightInches / rowCount;
  const yInches = rowHeight * zone.rowIndex;

  return {
    placementMode: 'row-strip',
    colorHex: zone.colorHex ?? DEFAULT_PLACEMENT_COLOR,
    polygonPoints: createRectPolygon(0, yInches, bed.widthInches, rowHeight),
  };
}

export function getWholeBedPlacement(
  bed: BedLayout,
): {
  placementMode: BedPlacementMode;
  colorHex: string;
  polygonPoints: PlacementPoint[];
} {
  return {
    placementMode: 'polygon',
    colorHex: DEFAULT_PLACEMENT_COLOR,
    polygonPoints: getBedFootprintPolygon(bed),
  };
}

export function normalizePlacementPoints(
  bed: BedLayout,
  polygonPoints: PlacementPoint[],
): PlacementPoint[] {
  const normalized = polygonPoints.map((point) => ({
    xInches: clamp(Math.round(point.xInches), 0, bed.widthInches),
    yInches: clamp(Math.round(point.yInches), 0, bed.heightInches),
  }));

  return normalized.length >= 3 ? normalized : getWholeBedPlacement(bed).polygonPoints;
}

export function calculateExpectedHarvestDateIso(
  plantedOnIso: string,
  seed: SeedMetadata,
): string {
  const plantedOn = new Date(plantedOnIso);
  const harvest = new Date(plantedOn);
  harvest.setDate(harvest.getDate() + seed.daysToMaturity);
  return harvest.toISOString();
}

export function calculateExpectedHarvestPounds(
  plantCount: number,
  seed: SeedMetadata,
): number {
  return Number((plantCount * seed.yield.averagePoundsPerPlant).toFixed(1));
}

export function isIsoDateValid(value: string | undefined): boolean {
  return !!value && !Number.isNaN(new Date(value).getTime());
}

export function computeBedOccupancyMetrics(
  bed: BedLayout,
  placements: BedPlacement[],
): OccupancyMetrics {
  const footprint = getBedFootprintPolygon(bed);
  const placementAreas = new Map<string, number>();
  const overlapPairs = new Set<string>();
  let totalAreaSqInches = 0;
  let occupiedAreaSqInches = 0;

  for (let y = 0; y < Math.max(1, Math.round(bed.heightInches)); y += 1) {
    for (let x = 0; x < Math.max(1, Math.round(bed.widthInches)); x += 1) {
      const point = { xInches: x + 0.5, yInches: y + 0.5 };
      if (!isPointInPolygon(point, footprint)) {
        continue;
      }

      totalAreaSqInches += 1;
      const occupying = placements.filter((placement) =>
        isPointInPolygon(point, placement.polygonPoints),
      );

      if (occupying.length === 0) {
        continue;
      }

      occupiedAreaSqInches += 1;
      for (const placement of occupying) {
        placementAreas.set(
          placement.id,
          (placementAreas.get(placement.id) ?? 0) + 1,
        );
      }

      if (occupying.length > 1) {
        for (let i = 0; i < occupying.length; i += 1) {
          for (let j = i + 1; j < occupying.length; j += 1) {
            const first = occupying[i].id;
            const second = occupying[j].id;
            overlapPairs.add([first, second].sort().join('::'));
          }
        }
      }
    }
  }

  return {
    occupiedAreaSqInches,
    openAreaSqInches: Math.max(0, totalAreaSqInches - occupiedAreaSqInches),
    totalAreaSqInches,
    overlapPairs: [...overlapPairs].map((value) => {
      const [first, second] = value.split('::');
      return [first, second] as [string, string];
    }),
    placementAreas,
  };
}

export function polygonAreaSqInches(points: PlacementPoint[]): number {
  if (points.length < 3) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    total += current.xInches * next.yInches - next.xInches * current.yInches;
  }

  return Math.abs(total / 2);
}

export function isPointInPolygon(
  point: PlacementPoint,
  polygon: PlacementPoint[],
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].xInches;
    const yi = polygon[i].yInches;
    const xj = polygon[j].xInches;
    const yj = polygon[j].yInches;
    const intersects =
      yi > point.yInches !== yj > point.yInches &&
      point.xInches <
        ((xj - xi) * (point.yInches - yi)) / Math.max(0.000001, yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
