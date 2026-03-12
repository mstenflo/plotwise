import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeedCatalogEntity } from './entities/seed-catalog.entity';
import { SeedMetadata } from './models/planner.types';

const STARTER_SEEDS: SeedMetadata[] = [
  {
    id: 'seed-tomato-sungold',
    name: 'Tomato',
    variety: 'Sungold',
    lifecycle: 'annual',
    family: 'Solanaceae',
    spacingInches: 24,
    rowSpacingInches: 36,
    daysToMaturity: 65,
    matureSpreadInches: 30,
    preferredSun: 'full-sun',
    soilPhMin: 6,
    soilPhMax: 6.8,
    successionFriendly: false,
    yield: { averagePoundsPerPlant: 10 },
    companionSeedIds: ['seed-lettuce-romaine'],
    notes: 'Indeterminate cherry tomato.'
  },
  {
    id: 'seed-lettuce-romaine',
    name: 'Lettuce',
    variety: 'Romaine',
    lifecycle: 'annual',
    family: 'Asteraceae',
    spacingInches: 8,
    rowSpacingInches: 12,
    daysToMaturity: 55,
    matureSpreadInches: 10,
    preferredSun: 'part-sun',
    soilPhMin: 6,
    soilPhMax: 7,
    successionFriendly: true,
    yield: { averagePoundsPerPlant: 0.5 },
    companionSeedIds: ['seed-tomato-sungold'],
    conflictSeedIds: ['seed-blueberry-patriot'],
    notes: 'Great for succession sowing every 2-3 weeks.'
  },
  {
    id: 'seed-blueberry-patriot',
    name: 'Blueberry',
    variety: 'Patriot',
    lifecycle: 'perennial',
    family: 'Ericaceae',
    spacingInches: 48,
    rowSpacingInches: 72,
    daysToMaturity: 365,
    matureSpreadInches: 60,
    preferredSun: 'full-sun',
    soilPhMin: 4.5,
    soilPhMax: 5.5,
    successionFriendly: false,
    yield: { averagePoundsPerPlant: 6 },
    conflictSeedIds: ['seed-lettuce-romaine'],
    notes: 'Perennial shrub, acidic soil required.'
  }
];

@Injectable()
export class SeedCatalogService implements OnModuleInit {
  constructor(
    @InjectRepository(SeedCatalogEntity)
    private readonly seedRepository: Repository<SeedCatalogEntity>
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.seedRepository.count();
    if (count > 0) {
      return;
    }

    await this.seedRepository.save(STARTER_SEEDS.map((seed) => this.toEntity(seed)));
  }

  async listSeeds(): Promise<SeedMetadata[]> {
    const entries = await this.seedRepository.find({
      order: {
        name: 'ASC',
        variety: 'ASC'
      }
    });

    return entries.map((entry) => this.toSeed(entry));
  }

  private toSeed(entity: SeedCatalogEntity): SeedMetadata {
    return {
      id: entity.id,
      name: entity.name,
      variety: entity.variety,
      lifecycle: entity.lifecycle,
      family: entity.family,
      spacingInches: entity.spacingInches,
      rowSpacingInches: entity.rowSpacingInches,
      daysToMaturity: entity.daysToMaturity,
      matureSpreadInches: entity.matureSpreadInches,
      preferredSun: entity.preferredSun,
      soilPhMin: entity.soilPhMin,
      soilPhMax: entity.soilPhMax,
      successionFriendly: entity.successionFriendly,
      yield: entity.yield,
      notes: entity.notes,
      companionSeedIds: entity.companionSeedIds,
      conflictSeedIds: entity.conflictSeedIds
    };
  }

  private toEntity(seed: SeedMetadata): SeedCatalogEntity {
    return this.seedRepository.create({
      id: seed.id,
      name: seed.name,
      variety: seed.variety,
      lifecycle: seed.lifecycle,
      family: seed.family,
      spacingInches: seed.spacingInches,
      rowSpacingInches: seed.rowSpacingInches,
      daysToMaturity: seed.daysToMaturity,
      matureSpreadInches: seed.matureSpreadInches,
      preferredSun: seed.preferredSun,
      soilPhMin: seed.soilPhMin,
      soilPhMax: seed.soilPhMax,
      successionFriendly: seed.successionFriendly,
      yield: seed.yield,
      notes: seed.notes,
      companionSeedIds: seed.companionSeedIds ?? [],
      conflictSeedIds: seed.conflictSeedIds ?? [],
      updatedAtIso: new Date().toISOString()
    });
  }
}
