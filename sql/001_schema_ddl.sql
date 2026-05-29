-- ============================================================================
-- Matano-Meters: National Fuel Price Transparency Platform
-- Production-Ready PostgreSQL DDL Schema
-- PostgreSQL 15+ with PostGIS 3.3+
-- ============================================================================
-- Migration: 001_initial_schema
-- Author: Architecture Team
-- Description: Core schema including geospatial types, partitioning,
--              trust system, and audit infrastructure.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. EXTENSION SETUP
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_partman;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================
CREATE TYPE fuel_type AS ENUM (
    'petrol', 'diesel', 'kerosene'
);

CREATE TYPE price_report_status AS ENUM (
    'pending',           -- awaiting consensus
    'verified',          -- passed verification
    'rejected',          -- failed anti-cheat
    'superseded',        -- replaced by newer report
    'flagged_anomaly'    -- flagged for manual review
);

CREATE TYPE user_tier AS ENUM (
    'unverified',        -- score 0-19
    'basic',             -- score 20-49
    'trusted',           -- score 50-79
    'verified_reporter', -- score 80-94
    'station_official',  -- score 95-99, station attendant
    'association_leader' -- score 100, Boda association head
);

CREATE TYPE session_channel AS ENUM (
    'ussd', 'whatsapp', 'pwa', 'api'
);

CREATE TYPE operator_role AS ENUM (
    'station_manager', 'regional_manager', 'corporate_admin'
);

-- ============================================================================
-- 2. GEOGRAPHIC HIERARCHY
-- ============================================================================
CREATE TABLE geo_regions (
    id              SMALLSERIAL PRIMARY KEY,
    code            VARCHAR(4) NOT NULL UNIQUE,
    name_en         VARCHAR(100) NOT NULL,
    name_lg         VARCHAR(100),       -- Luganda
    name_ny         VARCHAR(100),       -- Runyakitara
    geometry        GEOGRAPHY(MULTIPOLYGON, 4326),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_geo_regions_geom ON geo_regions USING GIST (geometry);

CREATE TABLE geo_districts (
    id              SMALLSERIAL PRIMARY KEY,
    region_id       SMALLINT NOT NULL REFERENCES geo_regions(id),
    code            VARCHAR(6) NOT NULL UNIQUE,
    name_en         VARCHAR(100) NOT NULL,
    name_lg         VARCHAR(100),
    name_ny         VARCHAR(100),
    geometry        GEOGRAPHY(MULTIPOLYGON, 4326),
    population      INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_geo_districts_region ON geo_districts(region_id);
CREATE INDEX idx_geo_districts_geom ON geo_districts USING GIST (geometry);

CREATE TABLE geo_subcounties (
    id              SERIAL PRIMARY KEY,
    district_id     SMALLINT NOT NULL REFERENCES geo_districts(id),
    code            VARCHAR(10) NOT NULL UNIQUE,
    name_en         VARCHAR(100) NOT NULL,
    name_lg         VARCHAR(100),
    name_ny         VARCHAR(100),
    geometry        GEOGRAPHY(MULTIPOLYGON, 4326),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_geo_subcounties_district ON geo_subcounties(district_id);
CREATE INDEX idx_geo_subcounties_geom ON geo_subcounties USING GIST (geometry);

-- ============================================================================
-- 3. FUEL OPERATORS (Companies)
-- ============================================================================
CREATE TABLE fuel_operators (
    id              SMALLSERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL UNIQUE,
    short_code      VARCHAR(10) NOT NULL UNIQUE,
    logo_url        VARCHAR(500),
    corporate_phone VARCHAR(20),
    corporate_email VARCHAR(200),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. FUEL STATIONS
-- ============================================================================
CREATE TABLE stations (
    id              SERIAL PRIMARY KEY,
    operator_id     SMALLINT NOT NULL REFERENCES fuel_operators(id),
    subcounty_id    INTEGER NOT NULL REFERENCES geo_subcounties(id),
    station_code    VARCHAR(20) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    location        GEOGRAPHY(POINT, 4326) NOT NULL,
    address         TEXT,
    contact_phone   VARCHAR(20),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    has_diesel      BOOLEAN NOT NULL DEFAULT TRUE,
    has_petrol      BOOLEAN NOT NULL DEFAULT TRUE,
    has_kerosene    BOOLEAN NOT NULL DEFAULT FALSE,
    opening_hours   VARCHAR(100),
    last_verified   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT stations_unique_active UNIQUE (station_code, is_active)
);

CREATE INDEX idx_stations_operator ON stations(operator_id);
CREATE INDEX idx_stations_subcounty ON stations(subcounty_id);
CREATE INDEX idx_stations_location ON stations USING GIST (location);
CREATE INDEX idx_stations_active ON stations(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- 5. USERS & TRUST SYSTEM
-- ============================================================================
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    msisdn_hash     VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256(salt + MSISDN)
    msisdn_salt     VARCHAR(32) NOT NULL,            -- per-user random salt
    msisdn_prefix   VARCHAR(4),                      -- country code only (e.g. "256")
    trust_score     SMALLINT NOT NULL DEFAULT 0 CHECK (trust_score BETWEEN 0 AND 100),
    tier            user_tier NOT NULL DEFAULT 'unverified',
    total_reports   INTEGER NOT NULL DEFAULT 0,
    verified_count  INTEGER NOT NULL DEFAULT 0,
    rejected_count  INTEGER NOT NULL DEFAULT 0,
    assoc_leader_id INTEGER,                          -- FK to boda associations table
    is_blacklisted  BOOLEAN NOT NULL DEFAULT FALSE,
    blacklist_reason TEXT,
    locale          VARCHAR(10) NOT NULL DEFAULT 'en',
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_trust_score ON users(trust_score DESC);
CREATE INDEX idx_users_tier ON users(tier);
CREATE INDEX idx_users_active ON users(last_active_at) WHERE last_active_at > NOW() - INTERVAL '30 days';

-- Staging table for unverified users (before anonymity is established)
CREATE TABLE user_registration_staging (
    id              BIGSERIAL PRIMARY KEY,
    raw_msisdn      VARCHAR(20) NOT NULL UNIQUE,  -- temporary, purged after 24h
    otp_code        VARCHAR(6) NOT NULL,
    otp_expires_at  TIMESTAMPTZ NOT NULL,
    otp_attempts    SMALLINT NOT NULL DEFAULT 0,
    locale          VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_reg_staging_raw_msisdn ON user_registration_staging(raw_msisdn);
CREATE INDEX idx_user_reg_staging_expires ON user_registration_staging(otp_expires_at) WHERE otp_expires_at > NOW();

-- ============================================================================
-- 6. PRICE REPORTS (Core Ingestion Table, Partitioned)
-- ============================================================================
CREATE TABLE price_reports (
    id                  BIGSERIAL,
    station_id          INTEGER NOT NULL REFERENCES stations(id),
    reporter_user_id    BIGINT NOT NULL REFERENCES users(id),
    fuel_type           fuel_type NOT NULL,
    reported_price      NUMERIC(6,2) NOT NULL CHECK (reported_price > 0),
    reporter_trust_score SMALLINT NOT NULL,
    reporter_tier       user_tier NOT NULL,
    location_lat        NUMERIC(9,6),          -- optional GPS from reporter
    location_lng        NUMERIC(9,6),
    channel             session_channel NOT NULL,
    session_id          VARCHAR(64),
    status              price_report_status NOT NULL DEFAULT 'pending',
    rejection_reason    TEXT,
    consensus_group_id  BIGINT,                -- FK to consensus_groups
    ip_address          INET,
    user_agent          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create initial partitions (12 months + future)
SELECT partman.create_parent(
    p_parent_table := 'public.price_reports',
    p_control := 'created_at',
    p_interval := '1 month',
    p_premake := 3,
    p_start_partition := '2026-01-01'
);

CREATE INDEX idx_price_reports_station ON price_reports(station_id, fuel_type, created_at DESC);
CREATE INDEX idx_price_reports_reporter ON price_reports(reporter_user_id, created_at DESC);
CREATE INDEX idx_price_reports_status ON price_reports(status, created_at DESC);
CREATE INDEX idx_price_reports_fuel ON price_reports(fuel_type, created_at DESC);

-- ============================================================================
-- 7. CONSENSUS GROUPS (For low-trust reporter verification)
-- ============================================================================
CREATE TABLE consensus_groups (
    id                  BIGSERIAL PRIMARY KEY,
    station_id          INTEGER NOT NULL REFERENCES stations(id),
    fuel_type           fuel_type NOT NULL,
    target_price_range  NUMRANGE,             -- acceptable range for consensus
    min_required_votes  SMALLINT NOT NULL DEFAULT 3,
    current_votes       SMALLINT NOT NULL DEFAULT 0,
    is_resolved         BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_price      NUMERIC(6,2),
    opens_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL, -- TTL = 15 minutes
    resolved_at         TIMESTAMPTZ
);

CREATE INDEX idx_consensus_groups_active ON consensus_groups(station_id, fuel_type)
    WHERE is_resolved = FALSE AND expires_at > NOW();
CREATE INDEX idx_consensus_groups_expires ON consensus_groups(expires_at)
    WHERE is_resolved = FALSE;

CREATE TABLE consensus_votes (
    id                  BIGSERIAL PRIMARY KEY,
    consensus_group_id  BIGINT NOT NULL REFERENCES consensus_groups(id),
    reporter_user_id    BIGINT NOT NULL REFERENCES users(id),
    reported_price      NUMERIC(6,2) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (consensus_group_id, reporter_user_id)
);

CREATE INDEX idx_consensus_votes_group ON consensus_votes(consensus_group_id);

-- ============================================================================
-- 8. VERIFIED PRICES (Current authoritative prices)
-- ============================================================================
CREATE TABLE verified_prices (
    id              BIGSERIAL PRIMARY KEY,
    station_id      INTEGER NOT NULL REFERENCES stations(id),
    fuel_type       fuel_type NOT NULL,
    price           NUMERIC(6,2) NOT NULL CHECK (price > 0),
    source_report_id BIGINT NOT NULL REFERENCES price_reports(id),
    verified_by_user_id BIGINT REFERENCES users(id),
    verification_method VARCHAR(50) NOT NULL,
        -- 'high_trust_direct', 'consensus_achieved', 'operator_official'
    median_baseline NUMERIC(6,2),            -- 48h moving median at time of verification
    deviation_pct   NUMERIC(5,2),            -- percentage deviation from baseline
    effective_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,             -- NULL = currently active
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_active_price UNIQUE (station_id, fuel_type, effective_until)
);

CREATE INDEX idx_verified_prices_active ON verified_prices(station_id, fuel_type)
    WHERE effective_until IS NULL;
CREATE INDEX idx_verified_prices_station_fuel ON verified_prices(station_id, fuel_type, effective_from DESC);

-- Materialized view for fast nearest-station queries
CREATE MATERIALIZED VIEW mv_nearest_cheapest AS
SELECT
    s.id AS station_id,
    s.station_code,
    s.name AS station_name,
    fo.name AS operator_name,
    fo.short_code AS operator_code,
    vp.fuel_type,
    vp.price,
    s.location,
    gd.id AS district_id,
    gd.name_en AS district_name,
    gr.id AS region_id,
    gr.name_en AS region_name,
    vp.updated_at
FROM stations s
JOIN fuel_operators fo ON fo.id = s.operator_id
JOIN verified_prices vp ON vp.station_id = s.id AND vp.effective_until IS NULL
JOIN geo_subcounties gs ON gs.id = s.subcounty_id
JOIN geo_districts gd ON gd.id = gs.district_id
JOIN geo_regions gr ON gr.id = gd.region_id
WHERE s.is_active = TRUE;

CREATE UNIQUE INDEX idx_mv_nearest_cheapest_unique ON mv_nearest_cheapest (station_id, fuel_type);
CREATE INDEX idx_mv_nearest_cheapest_loc ON mv_nearest_cheapest USING GIST (location);
CREATE INDEX idx_mv_nearest_cheapest_price ON mv_nearest_cheapest(fuel_type, price ASC);

-- ============================================================================
-- 9. TRUST SCORE EVENT LOG
-- ============================================================================
CREATE TABLE trust_score_events (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    score_delta     SMALLINT NOT NULL,
    new_score       SMALLINT NOT NULL,
    new_tier        user_tier NOT NULL,
    reason          VARCHAR(200) NOT NULL,
        -- 'report_accepted', 'report_rejected', 'consensus_contributed',
        -- 'consensus_expired', 'anomaly_flagged', 'operator_verified',
        -- 'manual_adjustment', 'sybil_detected'
    reference_id    BIGINT,                  -- FK to price_reports or consensus_votes
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trust_score_events_user ON trust_score_events(user_id, created_at DESC);
CREATE INDEX idx_trust_score_events_reason ON trust_score_events(reason);

-- ============================================================================
-- 10. OPERATOR STATION MANAGERS (Official Price Updates)
-- ============================================================================
CREATE TABLE operator_staff (
    id              SERIAL PRIMARY KEY,
    operator_id     SMALLINT NOT NULL REFERENCES fuel_operators(id),
    user_id         BIGINT NOT NULL REFERENCES users(id),
    role            operator_role NOT NULL,
    assigned_station_id INTEGER REFERENCES stations(id), -- NULL for regional/corp
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, operator_id)
);

CREATE INDEX idx_operator_staff_operator ON operator_staff(operator_id);
CREATE INDEX idx_operator_staff_station ON operator_staff(assigned_station_id);

CREATE TABLE operator_price_updates (
    id              BIGSERIAL PRIMARY KEY,
    station_id      INTEGER NOT NULL REFERENCES stations(id),
    fuel_type       fuel_type NOT NULL,
    old_price       NUMERIC(6,2) NOT NULL,
    new_price       NUMERIC(6,2) NOT NULL,
    updated_by      BIGINT NOT NULL REFERENCES users(id),
    otp_code_hash   VARCHAR(64) NOT NULL,
    otp_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    digital_signature TEXT,                  -- optional: PKI signature
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operator_updates_station ON operator_price_updates(station_id, created_at DESC);

-- ============================================================================
-- 11. RATE LIMITING & SYBIL DETECTION
-- ============================================================================
CREATE TABLE rate_limit_events (
    id              BIGSERIAL PRIMARY KEY,
    msisdn_hash     VARCHAR(64),
    ip_address      INET,
    endpoint        VARCHAR(100) NOT NULL,
    request_count   SMALLINT NOT NULL DEFAULT 1,
    window_start    TIMESTAMPTZ NOT NULL,
    window_end      TIMESTAMPTZ NOT NULL,
    blocked         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_lookup ON rate_limit_events(msisdn_hash, endpoint, window_start, window_end)
    WHERE blocked = FALSE;
CREATE INDEX idx_rate_limit_blocked ON rate_limit_events(blocked) WHERE blocked = TRUE;

CREATE TABLE blacklisted_entities (
    id              SERIAL PRIMARY KEY,
    entity_type     VARCHAR(20) NOT NULL CHECK (entity_type IN ('msisdn_hash', 'ip_address', 'device_id')),
    entity_value    VARCHAR(64) NOT NULL,
    reason          TEXT NOT NULL,
    detected_by     VARCHAR(100) NOT NULL,    -- 'rate_limiter', 'anomaly_engine', 'manual'
    blocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (entity_type, entity_value)
);

CREATE INDEX idx_blacklisted_active ON blacklisted_entities(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- 12. USSD SESSION AUDIT LOG
-- ============================================================================
CREATE TABLE ussd_session_logs (
    id              BIGSERIAL PRIMARY KEY,
    msisdn_hash     VARCHAR(64) NOT NULL,
    session_id      VARCHAR(64) NOT NULL,
    sequence_number SMALLINT NOT NULL,
    state           VARCHAR(50) NOT NULL,
    user_input      VARCHAR(200),
    system_response TEXT,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ussd_logs_session ON ussd_session_logs(session_id, sequence_number);
CREATE INDEX idx_ussd_logs_msisdn ON ussd_session_logs(msisdn_hash, created_at DESC);
CREATE INDEX idx_ussd_logs_created ON ussd_session_logs(created_at);

-- Partition helper for ussd logs (monthly)
SELECT partman.create_parent(
    p_parent_table := 'public.ussd_session_logs',
    p_control := 'created_at',
    p_interval := '1 month',
    p_premake := 3,
    p_start_partition := '2026-01-01'
);

-- ============================================================================
-- 13. ANOMALY DETECTION ALERTS
-- ============================================================================
CREATE TABLE anomaly_alerts (
    id              BIGSERIAL PRIMARY KEY,
    alert_type      VARCHAR(50) NOT NULL,
        -- 'price_spike', 'price_drop', 'sybil_cluster', 'report_velocity',
        -- 'geo_anomaly', 'trust_score_drop', 'operator_mismatch'
    severity        VARCHAR(10) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    station_id      INTEGER REFERENCES stations(id),
    fuel_type       fuel_type,
    reported_price  NUMERIC(6,2),
    median_baseline NUMERIC(6,2),
    deviation_pct   NUMERIC(5,2),
    detection_metadata JSONB,               -- flexible detection context
    is_resolved     BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by     BIGINT REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_anomaly_alerts_active ON anomaly_alerts(station_id, is_resolved)
    WHERE is_resolved = FALSE;
CREATE INDEX idx_anomaly_alerts_type ON anomaly_alerts(alert_type, created_at DESC);
CREATE INDEX idx_anomaly_alerts_severity ON anomaly_alerts(severity, created_at DESC)
    WHERE is_resolved = FALSE;

-- ============================================================================
-- 14. PRICE HISTORY CACHE INVALIDATION TRACKER
-- ============================================================================
CREATE TABLE cache_invalidation_log (
    id              BIGSERIAL PRIMARY KEY,
    cache_key       VARCHAR(200) NOT NULL,
    cache_region    VARCHAR(50) NOT NULL,    -- 'price', 'station', 'geo'
    invalidated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger_event   VARCHAR(50) NOT NULL,    -- 'price_update', 'station_update'
    trigger_id      BIGINT
);

CREATE INDEX idx_cache_invalidation_key ON cache_invalidation_log(cache_key, invalidated_at DESC);
CREATE INDEX idx_cache_invalidation_time ON cache_invalidation_log(invalidated_at)
    WHERE invalidated_at > NOW() - INTERVAL '1 hour';

-- ============================================================================
-- 15. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Update user trust score and tier on each report event
CREATE OR REPLACE FUNCTION fn_update_user_trust()
RETURNS TRIGGER AS $$
DECLARE
    v_new_score SMALLINT;
    v_new_tier  user_tier;
BEGIN
    -- Increment or decrement based on report status
    IF NEW.status = 'verified' THEN
        UPDATE users
        SET
            trust_score = LEAST(100, trust_score + 2),
            verified_count = verified_count + 1,
            total_reports = total_reports + 1
        WHERE id = NEW.reporter_user_id
        RETURNING trust_score INTO v_new_score;
    ELSIF NEW.status = 'rejected' THEN
        UPDATE users
        SET
            trust_score = GREATEST(0, trust_score - 5),
            rejected_count = rejected_count + 1,
            total_reports = total_reports + 1
        WHERE id = NEW.reporter_user_id
        RETURNING trust_score INTO v_new_score;
    END IF;

    -- Determine new tier
    v_new_tier := CASE
        WHEN v_new_score >= 95 THEN 'station_official'::user_tier
        WHEN v_new_score >= 80 THEN 'verified_reporter'::user_tier
        WHEN v_new_score >= 50 THEN 'trusted'::user_tier
        WHEN v_new_score >= 20 THEN 'basic'::user_tier
        ELSE 'unverified'::user_tier
    END;

    UPDATE users SET tier = v_new_tier WHERE id = NEW.reporter_user_id;

    -- Log trust event
    INSERT INTO trust_score_events (user_id, score_delta, new_score, new_tier, reason, reference_id)
    VALUES (
        NEW.reporter_user_id,
        CASE WHEN NEW.status = 'verified' THEN 2 ELSE -5 END,
        v_new_score,
        v_new_tier,
        CASE WHEN NEW.status = 'verified' THEN 'report_accepted' ELSE 'report_rejected' END,
        NEW.id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_price_report_update_trust
    AFTER UPDATE OF status ON price_reports
    FOR EACH ROW
    WHEN (OLD.status = 'pending' AND NEW.status IN ('verified', 'rejected'))
    EXECUTE FUNCTION fn_update_user_trust();

-- Refresh materialized view when verified prices change
CREATE OR REPLACE FUNCTION fn_refresh_mv_nearest()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_nearest_cheapest;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verified_prices_refresh_mv
    AFTER INSERT OR UPDATE OR DELETE ON verified_prices
    FOR EACH STATEMENT
    EXECUTE FUNCTION fn_refresh_mv_nearest();

-- ============================================================================
-- 16. MAINTENANCE JOBS (pg_cron or application scheduler)
-- ============================================================================

-- Expire stale consensus groups (runs every 5 minutes)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('expire-consensus', '*/5 * * * *',
--     $$UPDATE consensus_groups SET is_resolved = TRUE, resolved_at = NOW()
--       WHERE is_resolved = FALSE AND expires_at < NOW() AND current_votes < min_required_votes;$$
-- );

-- Purge registration staging data older than 24 hours
-- SELECT cron.schedule('purge-staging', '0 3 * * *',
--     $$DELETE FROM user_registration_staging WHERE created_at < NOW() - INTERVAL '24 hours';$$
-- );

-- Refresh nearest-cheapest MV every 5 minutes in addition to trigger
-- SELECT cron.schedule('refresh-mv-cheapest', '*/5 * * * *',
--     $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_nearest_cheapest;$$
-- );

-- ============================================================================
-- 17. GRANTS & RLS (Tiered access)
-- ============================================================================

-- Application roles
CREATE ROLE matano_app WITH LOGIN PASSWORD 'changeme_in_production';
CREATE ROLE matano_reader WITH LOGIN PASSWORD 'changeme_in_production';
CREATE ROLE matano_admin WITH LOGIN PASSWORD 'changeme_in_production' INHERIT CREATEDB;

-- Schema-level grants
GRANT USAGE ON SCHEMA public TO matano_app, matano_reader;
GRANT ALL ON SCHEMA public TO matano_admin;

-- Table grants
GRANT SELECT ON ALL TABLES IN SCHEMA public TO matano_reader;
GRANT SELECT, INSERT, UPDATE ON stations, price_reports, verified_prices,
    consensus_groups, consensus_votes, users, fuel_operators,
    operator_staff, operator_price_updates TO matano_app;
GRANT ALL ON ALL TABLES IN SCHEMA public TO matano_admin;

-- Sequence grants
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO matano_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO matano_admin;

-- Row-Level Security: users can only see their own records
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_self ON users
    FOR ALL
    USING (id = current_setting('app.current_user_id')::BIGINT);

CREATE POLICY report_self ON price_reports
    FOR SELECT
    USING (reporter_user_id = current_setting('app.current_user_id')::BIGINT);

COMMIT;
