-- ============================================================================
--  AFRICAN CALORIE TRACKER — PostgreSQL schema (v1 / MVP)
-- ----------------------------------------------------------------------------
--  Design goals baked into this schema:
--    1. Dual identity: a user can sign up with email, phone, or both.
--    2. Anonymous-first: a device can log data before any account exists,
--       then "claim" it by registering later (big retention win).
--    3. International: country, language, units per user; foods tagged by
--       region/country so the DB grows continent-wide without restructuring.
--    4. Offline-first sync: client generates UUID ids offline; every
--       user-owned row carries updated_at + a soft-delete flag so the
--       phone and server can reconcile changes (last-write-wins in v1).
--
--  Requires PostgreSQL 13+. Uses the pgcrypto extension for UUIDs.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- provides gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- provides gin_trgm_ops for search
CREATE EXTENSION IF NOT EXISTS unaccent;   -- accent-insensitive search (é=e, œ=oe …)

-- ============================================================================
--  USERS & IDENTITY
-- ============================================================================

-- A user account. Either email OR phone (or both) may be present, but at
-- least one must be set for a *registered* user. Anonymous devices don't
-- get a row here until they register (see devices table).
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email           TEXT UNIQUE,                 -- nullable: phone-only users
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    phone           TEXT UNIQUE,                 -- E.164 format e.g. +2376...
    phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,

    password_hash   TEXT,                        -- null if they use OTP-only
    display_name    TEXT,

    -- localisation / preferences
    country_code    CHAR(2) NOT NULL DEFAULT 'CM',   -- ISO 3166-1 alpha-2
    language        TEXT    NOT NULL DEFAULT 'fr',   -- 'fr' | 'en'
    unit_system     TEXT    NOT NULL DEFAULT 'metric',
    timezone        TEXT    NOT NULL DEFAULT 'Africa/Douala',

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- guarantee a registered user is reachable by at least one identifier
    CONSTRAINT users_need_identifier CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Devices allow anonymous-first usage. When the app first runs it registers
-- a device (client-generated UUID). Logs made offline attach to the device.
-- On registration we set user_id, "claiming" all that device's data.
CREATE TABLE devices (
    id              UUID PRIMARY KEY,            -- generated on the client
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,  -- null = anon
    platform        TEXT,                        -- 'android' | 'ios'
    app_version     TEXT,
    push_token      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_devices_user ON devices(user_id);

-- Short-lived one-time codes for phone/email OTP verification & login.
CREATE TABLE otp_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel         TEXT NOT NULL,               -- 'email' | 'sms'
    destination     TEXT NOT NULL,               -- the email or phone
    code_hash       TEXT NOT NULL,               -- never store raw codes
    expires_at      TIMESTAMPTZ NOT NULL,
    consumed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_destination ON otp_codes(destination, channel);

-- Per-user goal settings (weight-loss targets, budget). Separate from users
-- so history/versioning of goals can be added later without touching identity.
CREATE TABLE user_profiles (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    sex             TEXT,                        -- 'female' | 'male' | null
    birth_year      INT,
    height_cm       NUMERIC(5,1),
    activity_factor NUMERIC(3,2) NOT NULL DEFAULT 1.375,  -- Mifflin multiplier
    start_weight_kg NUMERIC(5,1),
    goal_weight_kg  NUMERIC(5,1),
    daily_target_kcal INT,                       -- computed, but stored/editable
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
--  FOOD DATABASE  (v2 — measures model)
-- ============================================================================
--  CSV columns -> table columns:
--    name_fr           -> name (primary), name_fr
--    name_en           -> name_en
--    search_aka        -> aka  (bilingual search synonyms)
--    region            -> region
--    category          -> category
--    basis             -> basis ('100g' | '100ml')
--    kcal_per_100      -> kcal_per_100  (always per 100 g or per 100 ml)
--    measures          -> food_measures rows (label:grams|label:grams ...)
--    status            -> verification_status
--    notes             -> notes
--
--  Calorie math (two steps, always):
--    grams = quantity * measure.grams
--    kcal  = round(grams / 100 * kcal_per_100)
-- ============================================================================

CREATE TABLE foods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,               -- French primary name
    aka             TEXT,                        -- bilingual search synonyms
    name_fr         TEXT,
    name_en         TEXT,

    country_code    CHAR(2),                     -- null = pan-African/generic
    region          TEXT,                        -- e.g. 'Littoral/Sawa'
    category        TEXT,                        -- 'sauce/stew','staple','fruit'...

    basis           TEXT NOT NULL DEFAULT '100g' -- '100g' | '100ml'
                        CHECK (basis IN ('100g','100ml')),
    kcal_per_100    NUMERIC(7,2) NOT NULL,       -- kcal per 100 g (or per 100 ml)

    -- optional macro columns (fill over time; nullable so CSV import works now)
    protein_g       NUMERIC(6,2),
    carbs_g         NUMERIC(6,2),
    fat_g           NUMERIC(6,2),

    verification_status TEXT NOT NULL DEFAULT 'estimate',  -- 'estimate' | 'verified'
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_foods_country ON foods(country_code);
CREATE INDEX idx_foods_category ON foods(category);
-- fast case-insensitive substring search across all name/synonym columns:
CREATE INDEX idx_foods_name_trgm ON foods USING gin (
    (coalesce(name_fr,'') || ' ' || coalesce(name_en,'') || ' ' || coalesce(aka,'')) gin_trgm_ops
);

-- One row per available measure for a food.
-- label='gram' is always present and means quantity × 1 g.
-- Liquids carry both label='gram' (grams) and label='ml' (grams = ml × density).
-- Local portions (louche, boule, bâton) are additional rows.
CREATE TABLE food_measures (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id     UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,          -- 'gram','tablespoon','ladle','1 plat moyen'…
    grams       NUMERIC(7,3) NOT NULL,  -- how many grams 1 unit of this measure weighs
    sort_order  INT NOT NULL DEFAULT 0  -- display order; gram=0 first
);
CREATE INDEX idx_food_measures_food ON food_measures(food_id);

-- Foods a user creates themselves (custom entries not in the master DB).
-- Same shape as foods but owned by a user; keeps the master DB clean while
-- letting people log anything. Popular customs become promotion candidates.
CREATE TABLE user_foods (
    id              UUID PRIMARY KEY,            -- client-generated (offline)
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id       UUID REFERENCES devices(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    unit            TEXT NOT NULL DEFAULT 'g',
    kcal_per_unit   NUMERIC(7,2) NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_user_foods_user ON user_foods(user_id);

-- ============================================================================
--  LOGGING  (the user's actual daily data — must sync offline)
-- ============================================================================

-- One row per food eaten. Client generates id offline; server reconciles.
-- We snapshot name + kcal at log time so edits to the food DB never rewrite
-- someone's history.
CREATE TABLE log_entries (
    id              UUID PRIMARY KEY,            -- client-generated (offline)
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id       UUID REFERENCES devices(id) ON DELETE SET NULL,

    log_date        DATE NOT NULL,               -- the day it counts toward
    meal            TEXT NOT NULL DEFAULT 'snack', -- breakfast|lunch|dinner|snack

    -- reference to a food OR a user food OR neither (free-text quick add)
    food_id         UUID REFERENCES foods(id) ON DELETE SET NULL,
    user_food_id    UUID REFERENCES user_foods(id) ON DELETE SET NULL,

    -- snapshot so history is immutable against later DB edits
    name_snapshot   TEXT NOT NULL,
    amount          NUMERIC(8,2),                -- grams or pieces
    unit            TEXT,                        -- 'g' | 'pc'
    kcal            INT NOT NULL,                -- computed at log time

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE   -- soft delete for sync
);
CREATE INDEX idx_log_user_date ON log_entries(user_id, log_date);
CREATE INDEX idx_log_device_date ON log_entries(device_id, log_date);
CREATE INDEX idx_log_updated ON log_entries(updated_at);   -- sync cursor

-- One row per day for day-level facts (steps done, notes). Kept separate
-- from entries so a day can exist with metadata even before food is logged.
CREATE TABLE day_records (
    id              UUID PRIMARY KEY,            -- client-generated
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id       UUID REFERENCES devices(id) ON DELETE SET NULL,
    log_date        DATE NOT NULL,
    steps_done      BOOLEAN NOT NULL DEFAULT FALSE,
    steps_count     INT,
    note            TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (user_id, log_date)
);
CREATE INDEX idx_dayrec_updated ON day_records(updated_at);

-- Weigh-ins.
CREATE TABLE weigh_ins (
    id              UUID PRIMARY KEY,            -- client-generated
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id       UUID REFERENCES devices(id) ON DELETE SET NULL,
    measured_on     DATE NOT NULL,
    weight_kg       NUMERIC(5,1) NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (user_id, measured_on)
);
CREATE INDEX idx_weigh_updated ON weigh_ins(updated_at);

-- ============================================================================
--  SUBSCRIPTIONS  (stub now, real when payments arrive — MoMo/Orange later)
-- ============================================================================
CREATE TABLE subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan            TEXT NOT NULL DEFAULT 'free',      -- 'free' | 'premium'
    status          TEXT NOT NULL DEFAULT 'active',    -- active|expired|cancelled
    provider        TEXT,                              -- 'mtn_momo'|'orange'|...
    current_period_end TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subs_user ON subscriptions(user_id);

-- ============================================================================
--  updated_at auto-touch trigger (keeps sync cursors honest)
-- ============================================================================
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- attach to the tables that use updated_at
CREATE TRIGGER t_users_touch    BEFORE UPDATE ON users        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_foods_touch    BEFORE UPDATE ON foods        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_log_touch      BEFORE UPDATE ON log_entries  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_day_touch      BEFORE UPDATE ON day_records  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_weigh_touch    BEFORE UPDATE ON weigh_ins    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER t_prof_touch     BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================================
--  END OF SCHEMA
--  Next steps:
--    * CREATE EXTENSION pg_trgm; (for the search index above)
--    * Import CSVs into foods (+ explode local_portion into food_portions)
--    * Build the /sync endpoint keyed on updated_at per table
-- ============================================================================
