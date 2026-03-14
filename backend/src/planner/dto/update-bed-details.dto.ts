import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SoilConditionDto {
  @IsNumber()
  ph!: number;

  @IsString()
  @Matches(/^(poor|moderate|good)$/)
  drainage!: 'poor' | 'moderate' | 'good';

  @IsNumber()
  organicMatterPercent!: number;
}

export class UpdateBedDetailsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rows?: number;

  @IsOptional()
  @IsString()
  @Matches(/^(full-sun|part-sun|shade)$/)
  sunExposure?: 'full-sun' | 'part-sun' | 'shade';

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SoilConditionDto)
  soil?: SoilConditionDto;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastSeasonFamily?: string;
}
