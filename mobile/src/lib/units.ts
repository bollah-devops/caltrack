/**
 * Unit conversion utilities for metric ↔ imperial.
 *
 * The DB always stores metric (kg, cm). Imperial is display/input only.
 * Calorie engine always receives metric values — convert before calling it.
 */

export type Units = "metric" | "imperial";

const KG_TO_LBS = 2.20462;
const IN_TO_CM  = 2.54;
const FT_TO_CM  = 30.48;

export function kgToLbs(kg: number): number {
  return Math.round(kg * KG_TO_LBS * 10) / 10;
}

export function lbsToKg(lbs: number): number {
  return Math.round((lbs / KG_TO_LBS) * 100) / 100;
}

export function ftInToCm(ft: number, inches: number): number {
  return ft * FT_TO_CM + inches * IN_TO_CM;
}

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = cm / IN_TO_CM;
  const ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn % 12);
  if (inch === 12) return { ft: ft + 1, inch: 0 }; // rounding edge case
  return { ft, inch };
}

/** Format a stored kg value in the user's preferred units. */
export function displayWeightKg(kg: number, units: Units): string {
  if (units === "imperial") return `${kgToLbs(kg)} lbs`;
  return `${Math.round(kg * 10) / 10} kg`;
}

/** Format a stored cm value in the user's preferred units. */
export function displayHeightCm(cm: number, units: Units): string {
  if (units === "imperial") {
    const { ft, inch } = cmToFtIn(cm);
    return `${ft}'${inch}"`;
  }
  return `${Math.round(cm)} cm`;
}
