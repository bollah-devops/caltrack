/**
 * Calorie Engine — the app's "brain".
 * Same math on mobile (offline) and backend. See calorie-engine-spec.md.
 *
 * Given a user's stats + goal, returns maintenance, daily target, and a
 * timeline estimate. Recalculated whenever weight changes.
 */

export type Sex = "female" | "male";
export type ActivityLevel =
  | "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";
export type Pace = "gentle" | "moderate";

export interface CalorieInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  pace?: Pace;          // used only for lose/gain
  goalWeightKg?: number; // for timeline estimate
}

export interface CalorieResult {
  bmr: number;
  maintenance: number;    // TDEE
  dailyTarget: number;    // after goal adjustment + safety floor
  flooredToMinimum: boolean;
  weeklyPaceKg: number;   // signed: negative = losing
  estimatedWeeks: number | null;
}

const ACTIVITY: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const KCAL_PER_KG = 7700;

export function calculateCalories(input: CalorieInput): CalorieResult {
  const { sex, age, heightCm, weightKg, activity, goal } = input;
  const pace: Pace = input.pace ?? "moderate";

  // Step 1 — BMR (Mifflin-St Jeor)
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmr = Math.round(sex === "female" ? base - 161 : base + 5);

  // Step 2 — TDEE / maintenance
  const maintenance = Math.round(bmr * ACTIVITY[activity]);

  // Step 3 — goal adjustment
  let adjustment = 0;            // kcal/day
  let weeklyPaceKg = 0;
  if (goal === "lose") {
    adjustment = pace === "gentle" ? -275 : -550;
    weeklyPaceKg = pace === "gentle" ? -0.25 : -0.5;
  } else if (goal === "gain") {
    adjustment = pace === "gentle" ? +275 : +400; // capped: surplus stays modest
    weeklyPaceKg = pace === "gentle" ? +0.25 : +0.5;
  }
  let target = maintenance + adjustment;

  // Step 4 — safety floor
  const floor = sex === "female" ? 1200 : 1500;
  let flooredToMinimum = false;
  if (target < floor) {
    target = floor;
    flooredToMinimum = true;
  }

  // Step 6 — timeline estimate
  let estimatedWeeks: number | null = null;
  if (input.goalWeightKg && weeklyPaceKg !== 0) {
    const delta = weightKg - input.goalWeightKg;      // + means needs to lose
    const weeks = delta / Math.abs(weeklyPaceKg);
    estimatedWeeks = weeks > 0 ? Math.round(weeks) : null;
  }

  return {
    bmr,
    maintenance,
    dailyTarget: Math.round(target),
    flooredToMinimum,
    weeklyPaceKg,
    estimatedWeeks,
  };
}

// --- quick self-check (Miriame's numbers) ---
// calculateCalories({ sex:"female", age:40, heightCm:170, weightKg:78.3,
//   activity:"light", goal:"lose", pace:"moderate", goalWeightKg:71 })
// -> bmr 1485, maintenance ~2042, dailyTarget ~1492, estimatedWeeks ~15
