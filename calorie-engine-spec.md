# Calorie Engine Specification (v1)

The "brain" of the app. Given a user's stats and goal, it outputs their
daily calorie target and walks the number down (or up) as their weight
changes. All logic here is standard, evidence-based nutrition math
(Mifflin-St Jeor + activity multiplier + goal adjustment).

---

## INPUTS (collected at onboarding)

1. sex: "female" | "male"
2. age: years (or birth_year, compute age)
3. height_cm: number
4. weight_kg: number (current weight)
5. activity_level: one of the 5 below
6. goal: "lose" | "maintain" | "gain"
7. pace: "gentle" | "moderate"   (only used for lose/gain)

---

## STEP 1 — BMR (Basal Metabolic Rate), Mifflin-St Jeor

Women:  BMR = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161
Men:    BMR = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5

(The only difference is the constant: -161 for women, +5 for men.)

Example — female, 78.3 kg, 170 cm, 40 yrs:
  (10*78.3) + (6.25*170) - (5*40) - 161
  = 783 + 1062.5 - 200 - 161
  = 1484.5 kcal  -> round to 1485

---

## STEP 2 — TDEE (Total Daily Energy Expenditure = maintenance)

TDEE = BMR * activity_factor

activity_factor:
  sedentary        (desk, little movement)          -> 1.2
  light            (desk + ~10k steps / light 1-3x) -> 1.375
  moderate         (exercise 3-5x/week)             -> 1.55
  active           (hard exercise 6-7x/week)        -> 1.725
  very_active      (physical job + training)        -> 1.9

TDEE is the user's MAINTENANCE calories — eat this to stay the same weight.

Example — 1485 * 1.375 = 2042  -> maintenance ~2040 kcal

---

## STEP 3 — GOAL ADJUSTMENT (the daily target)

Energy in 1 kg body fat ~= 7700 kcal.
So 0.5 kg/week needs ~550 kcal/day adjustment; 0.25 kg/week ~275/day.

LOSE:
  gentle   (-0.25 kg/week): target = TDEE - 275
  moderate (-0.5 kg/week):  target = TDEE - 550

MAINTAIN:
  target = TDEE   (no adjustment)

GAIN:  (surplus should be modest so it's muscle-favourable, not just fat)
  gentle   (+0.25 kg/week): target = TDEE + 275
  moderate (+0.5 kg/week):  target = TDEE + 400
  (note: gain surplus is smaller than loss deficit on purpose — a big
   surplus just adds fat. Cap moderate gain at +400, not +550.)

Example — female maintenance 2040:
  lose/moderate  -> 2040 - 550 = 1490  (~1500 target)
  maintain       -> 2040
  gain/gentle    -> 2040 + 275 = 2315

---

## STEP 4 — SAFETY FLOORS AND CEILINGS  (important — do not skip)

Never let the computed target drop below a safe minimum:
  women: floor = 1200 kcal
  men:   floor = 1500 kcal
If target < floor, set target = floor and show a gentle message:
  "To lose weight safely, we've set your minimum. Slower is healthier."

Do not offer aggressive paces (>0.5 kg/week loss) in v1 — keeps the app
safe and avoids crash-diet behaviour.

For gain: if user's BMI is already high, still allow it (they may want
muscle) but nudge toward protein + training message, not just more food.

---

## STEP 5 — RECALCULATION OVER TIME

A lighter body burns less; a heavier body burns more. So the target must
update as weight changes, or progress silently stalls.

Rule: every time the user logs a new weight, re-run Steps 1-4 with the
new weight_kg. If the new target differs from the stored one by >= 30 kcal,
update it and inform the user gently:
  "You've dropped to X kg — your new daily target is Y kcal."

This is why weight loss naturally slows near goal: TDEE falls as weight
falls, so the deficit shrinks unless recalculated. Recalculating keeps it
honest.

---

## STEP 6 — WHAT THE USER SEES (onboarding result screen)

Show all three numbers so they understand, not just the target:
  - "Your maintenance: ~2040 kcal (eat this to stay the same)"
  - "Your daily target: 1490 kcal (to lose ~0.5 kg/week)"
  - "At this pace you could reach [goal_weight] around [date estimate]"

Date estimate: weeks = (current_kg - goal_kg) / weekly_pace_kg
Show as a range, and remind them it's an estimate, not a promise
(water weight, cycles, etc. — the things Miriame learned firsthand).

---

## OPTIONAL LATER (v2)
- Macro targets (protein/carbs/fat) — protein especially matters for
  muscle retention when losing and muscle building when gaining.
  Simple rule: protein 1.6-2.0 g per kg bodyweight, rest split by preference.
- "Diabetic mode": surface carbohydrate totals prominently.
- Adaptive TDEE: learn the user's REAL burn from their logged intake vs
  actual weight change over 2-3 weeks, and correct the multiplier. This is
  the single most valuable upgrade — it personalises beyond the formula.
