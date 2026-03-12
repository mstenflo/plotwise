export type UnitSystem = 'imperial';

export interface LengthImperial {
  feet: number;
  inches: number;
}

export const INCHES_PER_FOOT = 12;

export function toInches(value: LengthImperial): number {
  return value.feet * INCHES_PER_FOOT + value.inches;
}

export function fromInches(totalInches: number): LengthImperial {
  const normalized = Math.max(0, Math.round(totalInches));
  return {
    feet: Math.floor(normalized / INCHES_PER_FOOT),
    inches: normalized % INCHES_PER_FOOT
  };
}

export function formatInches(totalInches: number): string {
  const value = fromInches(totalInches);
  return `${value.feet}' ${value.inches}\"`;
}
