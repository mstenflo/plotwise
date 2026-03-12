import { Controller, Get } from '@nestjs/common';
import { SeedCatalogService } from './seed-catalog.service';
import { SeedMetadata } from './models/planner.types';

@Controller('api/seeds')
export class SeedCatalogController {
  constructor(private readonly seedCatalogService: SeedCatalogService) {}

  @Get()
  async listSeeds(): Promise<SeedMetadata[]> {
    return this.seedCatalogService.listSeeds();
  }
}
