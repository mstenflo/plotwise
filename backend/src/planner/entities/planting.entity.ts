import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { BedPlacementMode, PlacementPoint } from '../models/planner.types';

@Entity({ name: 'plantings' })
export class PlantingEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  projectId!: string;

  @Column({ type: 'varchar', length: 64 })
  bedId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  legacyZoneId?: string;

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

  @Column({ type: 'varchar', length: 16, default: '#7ab77d' })
  colorHex!: string;

  @Column({ type: 'varchar', length: 24, default: 'polygon' })
  placementMode!: BedPlacementMode;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  polygonPoints!: PlacementPoint[];

  @Column({ type: 'timestamptz' })
  updatedAtIso!: string;
}
