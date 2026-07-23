# African Calorie Tracker — Project Skeleton

Monorepo for the calorie tracking app: a React Native (Expo) mobile app,
a NestJS + PostgreSQL backend, and Docker/infra for running it all.

Built to run **fully locally at zero cost** — you only pay for a server
when you decide to launch to real users.

## Structure

```
backend/           NestJS API (TypeScript)
  src/
    auth/          signup/login (email + phone), OTP, JWT, trial/entitlement
    users/         profiles, calorie-target calculation (the "engine")
    foods/         food database + search endpoints
    logs/          log entries, day records, weigh-ins
    sync/          offline sync endpoint (push/pull by updated_at)
    common/        shared utilities, guards
  migrations/
    001_init.sql        <- the PostgreSQL schema
    seed_cameroon.csv   <- the Cameroon food database (seed data)

mobile/            React Native (Expo) app
  src/
    screens/       Today, History, Weight, Onboarding, Paywall
    components/     reusable UI (food row, meal group, progress bar)
    db/            local SQLite (offline-first store)
    api/           talks to backend; queues writes when offline
    lib/           the calorie engine (same math as backend, runs offline)

infra/
  docker/          Dockerfiles
  docker-compose.yml   <- postgres + api for local dev
```

## Run it locally (high level)

1. `cd infra && docker compose up -d`   # starts Postgres
2. Load schema:  `psql ... -f backend/migrations/001_init.sql`
3. Seed foods:   run the import script (reads seed_cameroon.csv)
4. `cd backend && npm install && npm run start:dev`   # API on :3000
5. `cd mobile && npm install && npx expo start`        # app in Expo Go

## Build order (recommended)
1. DB schema + seed  (DONE — files in backend/migrations)
2. Backend: foods endpoint + calorie engine
3. Backend: auth (email/phone, trial)
4. Mobile: onboarding + calorie engine + local SQLite logging
5. Mobile: sync layer
6. Dockerize, single VPS, CI/CD, monitoring  -> LAUNCH
7. k3s migration (portfolio phase)

## Notes
- The calorie engine math lives in BOTH mobile (offline) and backend
  (authoritative). See calorie-engine-spec.md.
- Free core works offline forever. Trial/paywall enforced via on-device
  expiry date + anti-clock-rollback, confirmed on next online sync.
