# CLAUDE.md — Project context for Claude Code

## What this is

A calorie-tracking mobile app built for **African food**, starting with
Cameroon. The core insight: foreign apps (MyFitnessPal etc.) don't know
ndolé, eru, achu, kilishi, or how people here actually serve food. This one
does.

Positioning: *"L'appli qui connaît nos plats"* / *"Track your weight with the
food you actually eat."*

Two things it must do better than anything else:
1. **Tell the user their number** — calculate maintenance, deficit (lose),
   or surplus (gain) automatically. Users currently need a second app for this.
2. **Know local food and local portions** — "1 louche", "1 boule", "1 bâton",
   "1 plat complet", not just grams and barcodes.

## Stack

- **Mobile:** React Native + Expo, TypeScript
- **Backend:** NestJS (TypeScript), PostgreSQL
- **Local storage:** expo-sqlite (offline-first)
- **Infra:** Docker Compose locally → single VPS (Hetzner) → later k3s
- **CI/CD:** GitHub Actions

## Non-negotiable constraints

1. **OFFLINE-FIRST.** Connectivity in Cameroon is intermittent and data costs
   money. Food logging, the food database, budgets, and history MUST work with
   zero internet. Sync happens opportunistically. Never block the core loop on
   a network call.
2. **BILINGUAL (fr/en).** French is the default; English switches by user
   preference or phone locale. NEVER hard-code UI text — always use the i18n
   keys in `mobile/src/lib/i18n.ts`. Food search must match across BOTH
   languages (a user typing "groundnut" and one typing "arachide" find the
   same food).
3. **ANDROID FIRST.** ~85%+ of the market. iOS later.
4. **DATA-FRUGAL.** Light payloads, no heavy assets, no chatty polling.
   Users pay per megabyte.
5. **SAFETY IN THE CALORIE MATH.** Never let a computed target fall below
   1200 kcal (women) / 1500 (men). No aggressive (>0.5 kg/week) paces.
   Gain surplus is capped smaller than the loss deficit (muscle, not fat).

## Project structure

```
backend/
  src/
    auth/     signup (email OR phone), OTP, JWT, trial + entitlement
    users/    profiles, calorie target calculation
    foods/    food database + bilingual search  [foods.controller.ts done]
    logs/     log entries, day records, weigh-ins
    sync/     offline sync (push/pull by updated_at)
  migrations/
    001_init.sql                  full PostgreSQL schema
    seed_cameroon_v2.csv          133 Cameroon foods, fr+en, measures model
  import-foods.mjs                CSV -> Postgres seeder (tested)
mobile/
  src/
    screens/     OnboardingScreen.tsx, TodayScreen.tsx  [done]
                 HistoryScreen.tsx, WeightScreen.tsx    [TODO]
    db/          localStore.ts — expo-sqlite offline store [done]
    api/         foods.ts (search w/ offline fallback), bundledFoods.json
    lib/         calorieEngine.ts (tested), i18n.ts
infra/
  docker-compose.yml   postgres for local dev
```

## Key domain rules (get these right)

### THE MEASURES MODEL (v2 — this is the core data design)

Every food has **ONE base value**: `kcal_per_100` (per 100 g, or per 100 ml
for drinks — see `basis` column). Every food also carries a list of
**measures**, each of which converts to grams.

CSV `measures` column format: `label:grams|label:grams`
  e.g. puff-puff → `gram:1`
       palm oil  → `gram:1|ml:0.92|teaspoon:4.5|tablespoon:14|cup:218`
       ndolé     → `gram:1|tablespoon:15|cup:240|ladle:150`
       egg       → `gram:1|piece:50`

**Calorie math is always the same two steps:**
```
grams = quantity * measureGrams      // e.g. 2 tablespoons * 14 = 28 g
kcal  = Math.round(grams / 100 * kcalPer100)
```

This means the SAME food logged different ways gives the SAME answer
(1 piece of egg = 50 g = 78 kcal). Verified for 11 known values.

Rules:
- The user picks ANY available measure; grams is the default.
- Measure gram-weights are density-specific: 1 tbsp oil = 14 g but
  1 tbsp sugar = 12.5 g and 1 tbsp powdered milk = 9 g. Don't "simplify".
- Liquids offer BOTH ml and grams (ml converts via density).
- **Count pieces only for genuinely standard items** (egg, sugar cube,
  Coca Zero can). **Weigh anything that varies by seller** — puff-puff,
  accra, soya sticks are gram-only ON PURPOSE. Do not re-add piece
  measures to those.
- Local portions (louche, bâton, boule) are available as extra measures
  but are NOT the default.
- **Stews/sauces include the meat.** "Chicken stew 180/100g" = meat + sauce
  weighed together, as served. Don't double-log the protein.
- **Eru and Okok are DIFFERENT dishes.** Okok has two distinct variants:
  okok salé and okok sucré. (This was corrected — do not re-merge them.)
- **verification_status:** most foods are `estimate`. They become `verified`
  only when physically weighed/checked. Never silently mark things verified.
- **Local portions** live in `food_portions` (label + grams). Users should be
  able to tap "1 louche" instead of typing grams.

## Monetization / business logic (affects features)

- Phase 1: 3–7 day trial, then paid (~1,500 FCFA/month via MTN MoMo /
  Orange Money). Priced deliberately against slimming teas that cost
  60,000–100,000 FCFA here — the app is the cheap sane alternative.
- Phase 2 (once there's scale): open a free ad-supported tier.
- **Trial enforcement must work OFFLINE:** store `trial_ends_at` on device;
  the app locks when the date passes even with no internet. Defend against
  clock-rollback by storing the latest server time ever seen and refusing
  earlier device clocks. Payment itself requires connectivity (fine).
- Grace period: don't punish genuinely offline users — allow a rolling
  offline window (~14 days) for paid users before requiring a check-in.

## Style / conventions

- TypeScript everywhere, strict where practical.
- Theme colours (the "Steady" palette):
  bg `#FCF8FA`, card `#FFF`, ink `#33202B`, muted `#8A6E7C`,
  line `#EFE2E8`, accent `#B93A6A`, accentSoft `#F7E3EC`,
  good `#3E7C5B`, warn `#C77B2E`, over `#B0472F`
- Numbers displayed in a serif face (Georgia) for warmth; UI text sans.
- Keep components small and readable. No premature abstraction.
- Prefer boring, well-understood solutions over clever ones.

## What's DONE vs TODO

DONE (tested):
- Bilingual food DB v2 (133 foods) with the MEASURES model — verified
- PostgreSQL schema + CSV importer (BOTH NEED UPDATING to the v2 measures
  model — the schema still has the old unit/kcal_per_unit columns)
- Calorie engine (Mifflin-St Jeor + activity + goal + safety floors)
- Bilingual foods search API
- i18n system (fr/en)
- Onboarding screen (collects stats → shows maintenance/target/timeline)
- Today screen (budget, meal logging, steps, grouped meals)
- Local SQLite store + offline food fallback

TODO (in rough priority order):
0. MIGRATE CODE TO v2 MEASURES MODEL (schema, importer, API, app UI) — do
   this FIRST; everything else depends on it
1. HistoryScreen — past days, expandable to show foods per meal, edit entries
2. WeightScreen — weigh-ins, progress vs goal, trend
3. Auth module — email OR phone signup, OTP, JWT, trial start
4. Trial/entitlement enforcement (offline lock + clock-rollback defence)
5. Sync endpoint + client sync queue
6. Dockerfile for the API, CI/CD, then deploy

## How to work with me

- Run tests / typecheck before declaring something done.
- When touching the food database, remember it's partly hand-validated by
  the founder — don't "clean up" dish names or merge entries without asking.
- Ask before adding dependencies; keep the app light.
- Don't build v2 features (social, barcode scanning, meal plans) yet.
