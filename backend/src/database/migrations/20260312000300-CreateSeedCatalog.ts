import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSeedCatalog20260312000300 implements MigrationInterface {
  name = 'CreateSeedCatalog20260312000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "seed_catalog" (
        "id" character varying(64) NOT NULL,
        "name" character varying(120) NOT NULL,
        "variety" character varying(120) NOT NULL,
        "lifecycle" character varying(24) NOT NULL,
        "family" character varying(64) NOT NULL,
        "spacingInches" integer NOT NULL,
        "rowSpacingInches" integer NOT NULL,
        "daysToMaturity" integer NOT NULL,
        "matureSpreadInches" integer NOT NULL,
        "preferredSun" character varying(24) NOT NULL,
        "soilPhMin" double precision NOT NULL,
        "soilPhMax" double precision NOT NULL,
        "successionFriendly" boolean NOT NULL,
        "yield" jsonb NOT NULL,
        "notes" text,
        "companionSeedIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "conflictSeedIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "updatedAtIso" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_seed_catalog_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_seed_catalog_name" ON "seed_catalog" ("name")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_seed_catalog_family" ON "seed_catalog" ("family")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_seed_catalog_family"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_seed_catalog_name"');
    await queryRunner.query('DROP TABLE IF EXISTS "seed_catalog"');
  }
}
