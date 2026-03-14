import { MigrationInterface, QueryRunner } from 'typeorm';

type PlacementPoint = {
  xInches: number;
  yInches: number;
};

type LegacySeed = {
  id: string;
  daysToMaturity?: number;
  yield?: { averagePoundsPerPlant?: number };
};

type LegacyBedPlanting = {
  seedId: string;
  plantedOnIso: string;
  plantCount: number;
  expectedHarvestPounds?: number;
  expectedHarvestDateIso?: string;
};

type LegacyBedZone = {
  id: string;
  rowIndex: number;
  shapeType?: 'row-strip' | 'square' | 'polygon';
  colorHex?: string;
  rect?: {
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
  };
  polygon?: Array<{ xPct: number; yPct: number }>;
  planting?: LegacyBedPlanting;
};

type LegacyBed = {
  id: string;
  type: 'bed';
  widthInches: number;
  heightInches: number;
  rows: number;
  shapeType?: 'rectangle' | 'polygon';
  polygon?: Array<{ xPct: number; yPct: number }>;
  zones?: LegacyBedZone[];
  planting?: LegacyBedPlanting;
};

type LegacyProject = {
  id: string;
  seeds?: LegacySeed[];
  objects?: Array<LegacyBed | Record<string, unknown>>;
  completedTaskIds?: string[];
};

type LegacyPlantingRow = {
  id: string;
  projectId: string;
  bedId: string;
  zoneId?: string | null;
  legacyZoneId?: string | null;
  seedId: string;
  plantedOnIso: string;
  plantCount: number;
  expectedHarvestPounds?: number;
  expectedHarvestDateIso?: string;
};

export class ConvertPlantingsToPlacements20260313000100
  implements MigrationInterface
{
  name = 'ConvertPlantingsToPlacements20260313000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "plantings" ADD COLUMN IF NOT EXISTS "legacyZoneId" character varying(64)',
    );
    await queryRunner.query(
      `ALTER TABLE "plantings" ADD COLUMN IF NOT EXISTS "colorHex" character varying(16) NOT NULL DEFAULT '#7ab77d'`,
    );
    await queryRunner.query(
      `ALTER TABLE "plantings" ADD COLUMN IF NOT EXISTS "placementMode" character varying(24) NOT NULL DEFAULT 'polygon'`,
    );
    await queryRunner.query(
      `ALTER TABLE "plantings" ADD COLUMN IF NOT EXISTS "polygonPoints" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      'ALTER TABLE "calendar_tasks" ADD COLUMN IF NOT EXISTS "taskType" character varying(24)',
    );
    await queryRunner.query(
      'UPDATE "plantings" SET "legacyZoneId" = COALESCE("legacyZoneId", "zoneId")',
    );

    const projects = (await queryRunner.query(
      'SELECT "id", "seeds", "objects", "completedTaskIds" FROM "planner_projects"',
    )) as LegacyProject[];

    for (const project of projects) {
      const beds = (project.objects ?? []).filter(
        (object): object is LegacyBed =>
          typeof object === 'object' &&
          object !== null &&
          (object as { type?: string }).type === 'bed',
      );
      const plantings = (await queryRunner.query(
        'SELECT * FROM "plantings" WHERE "projectId" = $1 ORDER BY "updatedAtIso" DESC',
        [project.id],
      )) as LegacyPlantingRow[];

      const seenKeys = new Set<string>();
      const taskIdMap = new Map<string, string>();

      for (const row of plantings) {
        const bed = beds.find((entry) => entry.id === row.bedId);
        const legacyZoneId = row.legacyZoneId ?? row.zoneId ?? undefined;
        const zone = bed?.zones?.find((entry) => entry.id === legacyZoneId);
        const derivedPlacement = zone
          ? getLegacyZonePlacementPolygon(bed!, zone)
          : bed
            ? getWholeBedPlacementPolygon(bed)
            : {
                colorHex: '#7ab77d',
                placementMode: 'polygon' as const,
                polygonPoints: [],
              };
        const seed = (project.seeds ?? []).find((entry) => entry.id === row.seedId);
        const expectedHarvestDateIso = isValidDate(row.expectedHarvestDateIso)
          ? row.expectedHarvestDateIso!
          : seed
            ? deriveHarvestDate(row.plantedOnIso, seed)
            : row.plantedOnIso;
        const expectedHarvestPounds =
          typeof row.expectedHarvestPounds === 'number'
            ? row.expectedHarvestPounds
            : deriveExpectedYield(row.plantCount, seed);
        const nowIso = new Date().toISOString();

        await queryRunner.query(
          `
            UPDATE "plantings"
            SET "legacyZoneId" = $2,
                "colorHex" = $3,
                "placementMode" = $4,
                "polygonPoints" = $5::jsonb,
                "expectedHarvestPounds" = $6,
                "expectedHarvestDateIso" = $7,
                "updatedAtIso" = $8
            WHERE "id" = $1
          `,
          [
            row.id,
            legacyZoneId ?? null,
            derivedPlacement.colorHex,
            derivedPlacement.placementMode,
            JSON.stringify(derivedPlacement.polygonPoints),
            expectedHarvestPounds,
            expectedHarvestDateIso,
            nowIso,
          ],
        );

        seenKeys.add(buildPlacementKey(row.bedId, legacyZoneId));
        registerLegacyTaskIds(taskIdMap, row.bedId, legacyZoneId, row.id);
      }

      for (const bed of beds) {
        for (const zone of bed.zones ?? []) {
          if (!zone.planting) {
            continue;
          }

          const placementKey = buildPlacementKey(bed.id, zone.id);
          if (seenKeys.has(placementKey)) {
            continue;
          }

          const seed = (project.seeds ?? []).find(
            (entry) => entry.id === zone.planting?.seedId,
          );
          const geometry = getLegacyZonePlacementPolygon(bed, zone);
          const placementId = `planting-${crypto.randomUUID().slice(0, 8)}`;
          const expectedHarvestDateIso = isValidDate(
            zone.planting.expectedHarvestDateIso,
          )
            ? zone.planting.expectedHarvestDateIso!
            : seed
              ? deriveHarvestDate(zone.planting.plantedOnIso, seed)
              : zone.planting.plantedOnIso;
          const expectedHarvestPounds =
            typeof zone.planting.expectedHarvestPounds === 'number'
              ? zone.planting.expectedHarvestPounds
              : deriveExpectedYield(zone.planting.plantCount, seed);
          const nowIso = new Date().toISOString();

          await queryRunner.query(
            `
              INSERT INTO "plantings" (
                "id",
                "projectId",
                "bedId",
                "legacyZoneId",
                "seedId",
                "plantedOnIso",
                "plantCount",
                "expectedHarvestPounds",
                "expectedHarvestDateIso",
                "colorHex",
                "placementMode",
                "polygonPoints",
                "updatedAtIso"
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
            `,
            [
              placementId,
              project.id,
              bed.id,
              zone.id,
              zone.planting.seedId,
              zone.planting.plantedOnIso,
              zone.planting.plantCount,
              expectedHarvestPounds,
              expectedHarvestDateIso,
              geometry.colorHex,
              geometry.placementMode,
              JSON.stringify(geometry.polygonPoints),
              nowIso,
            ],
          );

          seenKeys.add(placementKey);
          registerLegacyTaskIds(taskIdMap, bed.id, zone.id, placementId);
        }

        if (!bed.planting) {
          continue;
        }

        const placementKey = buildPlacementKey(bed.id, undefined);
        if (seenKeys.has(placementKey)) {
          continue;
        }

        const seed = (project.seeds ?? []).find(
          (entry) => entry.id === bed.planting?.seedId,
        );
        const geometry = getWholeBedPlacementPolygon(bed);
        const placementId = `planting-${crypto.randomUUID().slice(0, 8)}`;
        const expectedHarvestDateIso = isValidDate(
          bed.planting.expectedHarvestDateIso,
        )
          ? bed.planting.expectedHarvestDateIso!
          : seed
            ? deriveHarvestDate(bed.planting.plantedOnIso, seed)
            : bed.planting.plantedOnIso;
        const expectedHarvestPounds =
          typeof bed.planting.expectedHarvestPounds === 'number'
            ? bed.planting.expectedHarvestPounds
            : deriveExpectedYield(bed.planting.plantCount, seed);
        const nowIso = new Date().toISOString();

        await queryRunner.query(
          `
            INSERT INTO "plantings" (
              "id",
              "projectId",
              "bedId",
              "legacyZoneId",
              "seedId",
              "plantedOnIso",
              "plantCount",
              "expectedHarvestPounds",
              "expectedHarvestDateIso",
              "colorHex",
              "placementMode",
              "polygonPoints",
              "updatedAtIso"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
          `,
          [
            placementId,
            project.id,
            bed.id,
            null,
            bed.planting.seedId,
            bed.planting.plantedOnIso,
            bed.planting.plantCount,
            expectedHarvestPounds,
            expectedHarvestDateIso,
            geometry.colorHex,
            geometry.placementMode,
            JSON.stringify(geometry.polygonPoints),
            nowIso,
          ],
        );

        seenKeys.add(placementKey);
        registerLegacyTaskIds(taskIdMap, bed.id, undefined, placementId);
      }

      const completedTaskIds = Array.isArray(project.completedTaskIds)
        ? [...new Set(project.completedTaskIds.map((taskId) => taskIdMap.get(taskId) ?? taskId))]
        : [];
      await queryRunner.query(
        'UPDATE "planner_projects" SET "completedTaskIds" = $2::jsonb WHERE "id" = $1',
        [project.id, JSON.stringify(completedTaskIds)],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "calendar_tasks" DROP COLUMN IF EXISTS "taskType"',
    );
    await queryRunner.query(
      'ALTER TABLE "plantings" DROP COLUMN IF EXISTS "polygonPoints"',
    );
    await queryRunner.query(
      'ALTER TABLE "plantings" DROP COLUMN IF EXISTS "placementMode"',
    );
    await queryRunner.query(
      'ALTER TABLE "plantings" DROP COLUMN IF EXISTS "colorHex"',
    );
    await queryRunner.query(
      'ALTER TABLE "plantings" DROP COLUMN IF EXISTS "legacyZoneId"',
    );
  }
}

function buildPlacementKey(bedId: string, legacyZoneId?: string): string {
  return `${bedId}::${legacyZoneId ?? 'bed'}`;
}

function registerLegacyTaskIds(
  taskIdMap: Map<string, string>,
  bedId: string,
  legacyZoneId: string | undefined,
  placementId: string,
): void {
  const suffix = legacyZoneId ? `${bedId}-${legacyZoneId}` : bedId;
  taskIdMap.set(`task-harvest-${suffix}`, `task-harvest-${placementId}`);
  taskIdMap.set(`task-succession-${suffix}`, `task-succession-${placementId}`);
}

function getLegacyZonePlacementPolygon(
  bed: LegacyBed,
  zone: LegacyBedZone,
): {
  colorHex: string;
  placementMode: 'row-strip' | 'block' | 'polygon';
  polygonPoints: PlacementPoint[];
} {
  if (zone.shapeType === 'polygon' && Array.isArray(zone.polygon) && zone.polygon.length >= 3) {
    return {
      colorHex: zone.colorHex ?? '#7ab77d',
      placementMode: 'polygon',
      polygonPoints: zone.polygon.map((point) => ({
        xInches: clamp(point.xPct * bed.widthInches, 0, bed.widthInches),
        yInches: clamp(point.yPct * bed.heightInches, 0, bed.heightInches),
      })),
    };
  }

  if (zone.shapeType === 'square' && zone.rect) {
    return {
      colorHex: zone.colorHex ?? '#7ab77d',
      placementMode: 'block',
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
  return {
    colorHex: zone.colorHex ?? '#7ab77d',
    placementMode: 'row-strip',
    polygonPoints: createRectPolygon(
      0,
      zone.rowIndex * rowHeight,
      bed.widthInches,
      rowHeight,
    ),
  };
}

function getWholeBedPlacementPolygon(bed: LegacyBed): {
  colorHex: string;
  placementMode: 'polygon';
  polygonPoints: PlacementPoint[];
} {
  if (bed.shapeType === 'polygon' && Array.isArray(bed.polygon) && bed.polygon.length >= 3) {
    return {
      colorHex: '#7ab77d',
      placementMode: 'polygon',
      polygonPoints: bed.polygon.map((point) => ({
        xInches: clamp(point.xPct * bed.widthInches, 0, bed.widthInches),
        yInches: clamp(point.yPct * bed.heightInches, 0, bed.heightInches),
      })),
    };
  }

  return {
    colorHex: '#7ab77d',
    placementMode: 'polygon',
    polygonPoints: createRectPolygon(0, 0, bed.widthInches, bed.heightInches),
  };
}

function createRectPolygon(
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

function deriveHarvestDate(plantedOnIso: string, seed?: LegacySeed): string {
  const plantedOn = new Date(plantedOnIso);
  const harvest = new Date(plantedOn);
  harvest.setDate(harvest.getDate() + (seed?.daysToMaturity ?? 0));
  return harvest.toISOString();
}

function deriveExpectedYield(plantCount: number, seed?: LegacySeed): number {
  return Number(
    (
      plantCount * (seed?.yield?.averagePoundsPerPlant ?? 0)
    ).toFixed(1),
  );
}

function isValidDate(value?: string): boolean {
  return !!value && !Number.isNaN(new Date(value).getTime());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
