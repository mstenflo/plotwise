import { BedLayout, BedPlacement, PlacementPoint } from './planner.model';

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

export function normalizePlacementPoints(
  bed: BedLayout,
  points: PlacementPoint[],
): PlacementPoint[] {
  if (points.length < 3) {
    return createRectPolygon(0, 0, bed.widthInches, bed.heightInches);
  }

  return points.map((point) => ({
    xInches: clamp(Math.round(point.xInches), 0, bed.widthInches),
    yInches: clamp(Math.round(point.yInches), 0, bed.heightInches),
  }));
}

export function translatePlacement(
  bed: BedLayout,
  placement: BedPlacement,
  deltaXInches: number,
  deltaYInches: number,
): PlacementPoint[] {
  return normalizePlacementPoints(
    bed,
    placement.polygonPoints.map((point) => ({
      xInches: point.xInches + deltaXInches,
      yInches: point.yInches + deltaYInches,
    })),
  );
}

export function getPlacementAreaSqInches(points: PlacementPoint[]): number {
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

export function isPointInPolygon(point: PlacementPoint, polygon: PlacementPoint[]): boolean {
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
