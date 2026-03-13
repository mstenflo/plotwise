import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddZoneColumnsToPlanningTables20260312000600 implements MigrationInterface {
  name = 'AddZoneColumnsToPlanningTables20260312000600';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "plantings" ADD COLUMN IF NOT EXISTS "zoneId" character varying(64)'
    );
    await queryRunner.query(
      'ALTER TABLE "calendar_tasks" ADD COLUMN IF NOT EXISTS "zoneId" character varying(64)'
    );

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_plantings_projectId_bedId_zoneId" ON "plantings" ("projectId", "bedId", "zoneId")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_calendar_tasks_projectId_bedId_zoneId" ON "calendar_tasks" ("projectId", "bedId", "zoneId")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_calendar_tasks_projectId_bedId_zoneId"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_plantings_projectId_bedId_zoneId"');

    await queryRunner.query('ALTER TABLE "calendar_tasks" DROP COLUMN IF EXISTS "zoneId"');
    await queryRunner.query('ALTER TABLE "plantings" DROP COLUMN IF EXISTS "zoneId"');
  }
}
