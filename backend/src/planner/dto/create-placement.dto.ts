import {
  IsArray,
  IsDateString,
  IsHexColor,
  IsInt,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PlacementPointDto {
  @IsNumber()
  xInches!: number;

  @IsNumber()
  yInches!: number;
}

export class CreatePlacementDto {
  @IsString()
  @MaxLength(64)
  seedId!: string;

  @IsDateString()
  plantedOnIso!: string;

  @IsInt()
  @Min(1)
  plantCount!: number;

  @IsHexColor()
  colorHex!: string;

  @IsString()
  @Matches(/^(row-strip|block|polygon)$/)
  placementMode!: 'row-strip' | 'block' | 'polygon';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlacementPointDto)
  polygonPoints!: PlacementPointDto[];
}
