import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'plantings' })
export class PlantingEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  projectId!: string;

  @Column({ type: 'varchar', length: 64 })
  bedId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  zoneId?: string;

  @Column({ type: 'varchar', length: 64 })
  seedId!: string;

  @Column({ type: 'timestamptz' })
  plantedOnIso!: string;

  @Column({ type: 'int' })
  plantCount!: number;

  @Column({ type: 'float' })
  expectedHarvestPounds!: number;

  @Column({ type: 'timestamptz' })
  expectedHarvestDateIso!: string;

  @Column({ type: 'timestamptz' })
  updatedAtIso!: string;
}
