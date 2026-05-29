# Matano-Meters — The National Fuel Price Transparency Platform

**Ministry of Works and Transport** | **Ministry of Energy and Mineral Development (MEMD)** | **Republic of Uganda**

---

- **Platform:** Matano-Meters (National Fuel Price Transparency Platform)
- **Channels:** USSD (`*284*X#`), WhatsApp Bot, Progressive Web App (PWA)
- **Target Load:** 150,000 concurrent peak-hour sessions
- **Stack:** PostgreSQL 15+ / PostGIS 3.3+, Redis 7+, Kafka/RabbitMQ, Node.js/Go Workers, React/Vue PWA
- **Compliance:** Uganda Data Protection and Privacy Act (2019), NITA-U e-Gov Standards

---

# Table of Contents

1. [System Topography Mapping](#1-system-topography-mapping)
2. [Database Schema DDL](#2-database-schema-ddl)
3. [USSD Stateful Session Logic Flow](#3-ussd-stateful-session-logic-flow)
4. [Security Framework](#4-security-framework)

---

# 1. System Topography Mapping

## 1.1 End-to-End Cloud Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                       │
│                (Boda Riders / Matatu Drivers / Station Attendants)           │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    CDN / DDoS PROTECTION LAYER                               │
│              Cloudflare (DNS, WAF, Rate Limiting, SSL Termination)            │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY LAYER                                     │
│                    Kong / AWS API Gateway (OAuth2, JWT, mTLS)                │
│                                                                              │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ /ussd/*      │  │ /whatsapp/*   │  │ /api/v1/*    │  │ /ws/*           │ │
│  │ (REST hook)  │  │ (Webhook)     │  │ (REST/Graph) │  │ (WebSocket)     │ │
│  └──────┬───────┘  └───────┬───────┘  └──────┬───────┘  └────────┬────────┘ │
└─────────┼──────────────────┼──────────────────┼───────────────────┼──────────┘
          │                  │                  │                   │
          ▼                  ▼                  ▼                   ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Africa's Talking │  │ Meta WhatsApp    │  │ PWA Backend  │  │ WebSocket         │
│ USSD Connector   │  │ Business API     │  │ (Node.js/Go) │  │ Server (WS       │
│ (SMS/USSD       │  │ Connector        │  │              │  │  + Server-Sent   │
│  Gateway)        │  │ (Cloud API)      │  │              │  │  Events)         │
└────────┬────────┘  └────────┬─────────┘  └──────┬───────┘  └────────┬─────────┘
         │                    │                    │                   │
         └──────────┬─────────┘                    │                   │
                    │                              │                   │
                    ▼                              ▼                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     ASYNCHRONOUS EVENT BUS LAYER                             │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │            Apache Kafka / RabbitMQ (Clustered, HA)                   │    │
│  │                                                                      │    │
│  │  Topics:                                                             │    │
│  │  - ussd.requests     - price.reports          - verification.results │    │
│  │  - whatsapp.messages - location.pins          - notifications.send   │    │
│  │  - consensus.events  - anomaly.alerts         - audit.logs           │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                   INTERNAL WORKER MICROSERVICES POOL                         │
│                     (Kubernetes / Nomad, Auto-scaled)                       │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ USSD Session  │  │ WhatsApp     │  │ Verification  │  │ Price            │ │
│  │ Worker        │  │ Message      │  │ Engine        │  │ Aggregator       │ │
│  │ (State Mgmt)  │  │ Worker       │  │ (Anti-Cheat)  │  │ (Median Calc)    │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
│         │                 │                 │                   │           │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴─────────┐  │
│  │ GIS / Spatial │  │ Trust Score  │  │ Notification │  │ Station        │  │
│  │ Query Worker  │  │ Engine       │  │ Worker       │  │ Console Worker │  │
│  │ (PostGIS)     │  │ (Redis)      │  │ (Push/SMS)   │  │ (Operator OTP) │  │
│  └───────────────┘  └──────────────┘  └──────────────┘  └────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │  Analytics & Anomaly Detection Worker (Spark/Flink Stream)           │    │
│  │  - Real-time Sybil attack detection                                  │    │
│  │  - Geospatial price anomaly clustering                               │    │
│  │  - Moving median deviation alerts                                    │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         DATA & PERSISTENCE LAYER                             │
│                                                                              │
│  ┌─────────────────────────┐  ┌────────────────────┐  ┌───────────────────┐ │
│  │ PostgreSQL + PostGIS    │  │ Redis Cluster       │  │ MinIO / S3        │ │
│  │ (RDS / Aurora)          │  │ (6+ nodes, HA)      │  │ Compatible Store  │ │
│  │                         │  │                     │  │                   │ │
│  │ • Stations (GEOGRAPHY)  │  │ • USSD Sessions     │  │ • Station Photos  │ │
│  │ • Price Reports         │  │ • Rate Limit Buckets│  │ • Receipt Images  │ │
│  │ • Verified Prices       │  │ • Price Cache       │  │ • ID Documents    │ │
│  │ • Users (hashed MSISDN) │  │ • Trust Score Cache │  │ • Audit Exports   │ │
│  │ • Geo Hierarchy         │  │ • Geo Index Cache   │  │                   │ │
│  │ • Audit Logs            │  │ • Leaderboard       │  │                   │ │
│  └─────────────────────────┘  └────────────────────┘  └───────────────────┘ │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │  TimescaleDB (Time-series extension) or pg_partman                   │    │
│  │  - Auto-partitioned price_reports by month                          │    │
│  │  - 12-month rolling retention                                       │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                   MONITORING & OBSERVABILITY                                 │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Prometheus +  │  │ Grafana       │  │ ELK / Loki   │  │ PagerDuty /      │ │
│  │ Metrics       │  │ Dashboards    │  │ Log Pipeline │  │ Opsgenie Alerts │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 1.2 Data Flow: USSD Price Report Submission

```
User dials *284*1#
     │
     ▼
Africa's Talking → POST /ussd/inbound
     │
     ▼
API Gateway → Route to /ussd/* endpoint
     │
     ▼
USSD Connector → Parse MSISDN + SessionID + Text
     │
     ├──► Redis: Get session:{msisdn} (restore state)
     │
     ▼
USSD Connector → Enrich & publish to Kafka topic: `ussd.requests`
     │
     ▼
USSD Session Worker (consumes topic)
     ├──► Redis: Update session:{msisdn} state machine
     ├──► If price report: publish to `price.reports`
     │
     ▼
Verification Engine (consumes `price.reports`)
     ├──► Compute 48h median for station+fuel_type
     ├──► Check reporter trust score
     ├──► If low trust: open consensus window (TTL 15 min)
     │               → wait for 3 matching reports
     │               → publish to `consensus.events`
     ├──► If high trust: publish to `verification.results`
     │
     ▼
Price Aggregator (consumes `verification.results`)
     ├──► Update verified_prices table
     ├──► Invalidate Redis price cache
     ├──► Publish to `notifications.send`
     │
     ▼
USSD Session Worker → Compose response → Kafka: `ussd.responses`
     │
     ▼
Africa's Talking → Deliver CON/END to user's handset
```

## 1.3 Data Flow: WhatsApp Location-Based Query

```
User sends location via WhatsApp
     │
     ▼
Meta Cloud API → POST /whatsapp/inbound
     │
     ▼
API Gateway → Route to /whatsapp/* endpoint
     │
     ▼
WhatsApp Connector → Extract GeoJSON from Location object
     │
     ▼
Publish to `whatsapp.messages` (Kafka)
     │
     ▼
WhatsApp Message Worker
     ├──► Parse lat/lng from GeoJSON
     ├──► Query PostGIS:
     │     SELECT * FROM stations
     │     WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($lng,$lat),4326), 5000)
     │     ORDER BY price_per_liter ASC LIMIT 3;
     ├──► Format interactive list message
     ├──► Publish to `notifications.send`
     │
     ▼
Notification Worker → POST to Meta WhatsApp API
     │
     ▼
User receives interactive message with station list
```

## 1.4 Asynchronous Processing Contract

| Component | Input Topic | Output Topic | Consumer Group |
|---|---|---|---|
| USSD Connector | (HTTP) | `ussd.requests` | ussd-ingest |
| WhatsApp Connector | (HTTP) | `whatsapp.messages` | wa-ingest |
| USSD Session Worker | `ussd.requests` | `price.reports`, `ussd.responses` | ussd-session |
| WhatsApp Message Worker | `whatsapp.messages` | `price.reports`, `wa.responses` | wa-session |
| Verification Engine | `price.reports` | `verification.results`, `consensus.events` | verification |
| Price Aggregator | `verification.results` | `notifications.send` | aggregation |
| Notification Worker | `notifications.send` | (HTTP outbound) | notifier |
| Anomaly Detector | `price.reports`, `verification.results` | `anomaly.alerts` | anomaly-ml |

## 1.5 Infrastructure Scaling Parameters

| Service | Min Replicas | Max Replicas | Scale Trigger | Avg CPU Threshold |
|---|---|---|---|---|
| USSD Connector | 3 | 20 | Kafka lag + CPU | 70% |
| WhatsApp Connector | 2 | 15 | Kafka lag + CPU | 70% |
| Verification Engine | 5 | 30 | Kafka lag | 60% |
| Price Aggregator | 3 | 10 | Event count | 70% |
| GIS Worker | 2 | 10 | Request latency > 500ms | 75% |
| PWA Backend | 3 | 12 | HTTP req/s > 1000 | 65% |
| Notification Worker | 5 | 25 | Queue depth | 60% |

---

# 2. Database Schema DDL

## 2.1 Extension Setup

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_partman;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

## 2.2 Enum Types

```sql
CREATE TYPE fuel_type AS ENUM (
    'petrol', 'diesel', 'kerosene'
);

CREATE TYPE price_report_status AS ENUM (
    'pending', 'verified', 'rejected', 'superseded', 'flagged_anomaly'
);

CREATE TYPE user_tier AS ENUM (
    'unverified', 'basic', 'trusted', 'verified_reporter',
    'station_official', 'association_leader'
);

CREATE TYPE session_channel AS ENUM (
    'ussd', 'whatsapp', 'pwa', 'api'
);

CREATE TYPE operator_role AS ENUM (
    'station_manager', 'regional_manager', 'corporate_admin'
);
```

## 2.3 Geographic Hierarchy

```sql
CREATE TABLE geo_regions (
    id              SMALLSERIAL PRIMARY KEY,
    code            VARCHAR(4) NOT NULL UNIQUE,
    name_en         VARCHAR(100) NOT NULL,
    name_lg         VARCHAR(100),
    name_ny         VARCHAR(100),
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
```

## 2.4 Fuel Operators & Stations

```sql
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
```

## 2.5 Users & Trust System

```sql
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    msisdn_hash     VARCHAR(64) NOT NULL UNIQUE,
    msisdn_salt     VARCHAR(32) NOT NULL,
    msisdn_prefix   VARCHAR(4),
    trust_score     SMALLINT NOT NULL DEFAULT 0 CHECK (trust_score BETWEEN 0 AND 100),
    tier            user_tier NOT NULL DEFAULT 'unverified',
    total_reports   INTEGER NOT NULL DEFAULT 0,
    verified_count  INTEGER NOT NULL DEFAULT 0,
    rejected_count  INTEGER NOT NULL DEFAULT 0,
    assoc_leader_id INTEGER,
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

CREATE TABLE user_registration_staging (
    id              BIGSERIAL PRIMARY KEY,
    raw_msisdn      VARCHAR(20) NOT NULL UNIQUE,
    otp_code        VARCHAR(6) NOT NULL,
    otp_expires_at  TIMESTAMPTZ NOT NULL,
    otp_attempts    SMALLINT NOT NULL DEFAULT 0,
    locale          VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_reg_staging_raw_msisdn ON user_registration_staging(raw_msisdn);
CREATE INDEX idx_user_reg_staging_expires ON user_registration_staging(otp_expires_at) WHERE otp_expires_at > NOW();
```

## 2.6 Price Reports (Partitioned)

```sql
CREATE TABLE price_reports (
    id                  BIGSERIAL,
    station_id          INTEGER NOT NULL REFERENCES stations(id),
    reporter_user_id    BIGINT NOT NULL REFERENCES users(id),
    fuel_type           fuel_type NOT NULL,
    reported_price      NUMERIC(6,2) NOT NULL CHECK (reported_price > 0),
    reporter_trust_score SMALLINT NOT NULL,
    reporter_tier       user_tier NOT NULL,
    location_lat        NUMERIC(9,6),
    location_lng        NUMERIC(9,6),
    channel             session_channel NOT NULL,
    session_id          VARCHAR(64),
    status              price_report_status NOT NULL DEFAULT 'pending',
    rejection_reason    TEXT,
    consensus_group_id  BIGINT,
    ip_address          INET,
    user_agent          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

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
```

## 2.7 Consensus Groups & Votes

```sql
CREATE TABLE consensus_groups (
    id                  BIGSERIAL PRIMARY KEY,
    station_id          INTEGER NOT NULL REFERENCES stations(id),
    fuel_type           fuel_type NOT NULL,
    target_price_range  NUMRANGE,
    min_required_votes  SMALLINT NOT NULL DEFAULT 3,
    current_votes       SMALLINT NOT NULL DEFAULT 0,
    is_resolved         BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_price      NUMERIC(6,2),
    opens_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
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
```

## 2.8 Verified Prices & Materialized View

```sql
CREATE TABLE verified_prices (
    id              BIGSERIAL PRIMARY KEY,
    station_id      INTEGER NOT NULL REFERENCES stations(id),
    fuel_type       fuel_type NOT NULL,
    price           NUMERIC(6,2) NOT NULL CHECK (price > 0),
    source_report_id BIGINT NOT NULL REFERENCES price_reports(id),
    verified_by_user_id BIGINT REFERENCES users(id),
    verification_method VARCHAR(50) NOT NULL,
    median_baseline NUMERIC(6,2),
    deviation_pct   NUMERIC(5,2),
    effective_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_active_price UNIQUE (station_id, fuel_type, effective_until)
);
CREATE INDEX idx_verified_prices_active ON verified_prices(station_id, fuel_type)
    WHERE effective_until IS NULL;
CREATE INDEX idx_verified_prices_station_fuel ON verified_prices(station_id, fuel_type, effective_from DESC);

CREATE MATERIALIZED VIEW mv_nearest_cheapest AS
SELECT
    s.id AS station_id, s.station_code, s.name AS station_name,
    fo.name AS operator_name, fo.short_code AS operator_code,
    vp.fuel_type, vp.price, s.location,
    gd.id AS district_id, gd.name_en AS district_name,
    gr.id AS region_id, gr.name_en AS region_name,
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
```

## 2.9 Trust Score Audit Log

```sql
CREATE TABLE trust_score_events (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    score_delta     SMALLINT NOT NULL,
    new_score       SMALLINT NOT NULL,
    new_tier        user_tier NOT NULL,
    reason          VARCHAR(200) NOT NULL,
    reference_id    BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trust_score_events_user ON trust_score_events(user_id, created_at DESC);
CREATE INDEX idx_trust_score_events_reason ON trust_score_events(reason);
```

## 2.10 Operator Management & Security Tables

```sql
CREATE TABLE operator_staff (
    id              SERIAL PRIMARY KEY,
    operator_id     SMALLINT NOT NULL REFERENCES fuel_operators(id),
    user_id         BIGINT NOT NULL REFERENCES users(id),
    role            operator_role NOT NULL,
    assigned_station_id INTEGER REFERENCES stations(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, operator_id)
);

CREATE TABLE operator_price_updates (
    id              BIGSERIAL PRIMARY KEY,
    station_id      INTEGER NOT NULL REFERENCES stations(id),
    fuel_type       fuel_type NOT NULL,
    old_price       NUMERIC(6,2) NOT NULL,
    new_price       NUMERIC(6,2) NOT NULL,
    updated_by      BIGINT NOT NULL REFERENCES users(id),
    otp_code_hash   VARCHAR(64) NOT NULL,
    otp_verified    BOOLEAN NOT NULL DEFAULT FALSE,
    digital_signature TEXT,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE blacklisted_entities (
    id              SERIAL PRIMARY KEY,
    entity_type     VARCHAR(20) NOT NULL CHECK (entity_type IN ('msisdn_hash', 'ip_address', 'device_id')),
    entity_value    VARCHAR(64) NOT NULL,
    reason          TEXT NOT NULL,
    detected_by     VARCHAR(100) NOT NULL,
    blocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (entity_type, entity_value)
);

CREATE TABLE ussd_session_logs (
    id              BIGSERIAL,
    msisdn_hash     VARCHAR(64) NOT NULL,
    session_id      VARCHAR(64) NOT NULL,
    sequence_number SMALLINT NOT NULL,
    state           VARCHAR(50) NOT NULL,
    user_input      VARCHAR(200),
    system_response TEXT,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE anomaly_alerts (
    id              BIGSERIAL PRIMARY KEY,
    alert_type      VARCHAR(50) NOT NULL,
    severity        VARCHAR(10) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    station_id      INTEGER REFERENCES stations(id),
    fuel_type       fuel_type,
    reported_price  NUMERIC(6,2),
    median_baseline NUMERIC(6,2),
    deviation_pct   NUMERIC(5,2),
    detection_metadata JSONB,
    is_resolved     BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by     BIGINT REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);
```

## 2.11 Triggers & Functions

```sql
CREATE OR REPLACE FUNCTION fn_update_user_trust()
RETURNS TRIGGER AS $$
DECLARE
    v_new_score SMALLINT;
    v_new_tier  user_tier;
BEGIN
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

    v_new_tier := CASE
        WHEN v_new_score >= 95 THEN 'station_official'::user_tier
        WHEN v_new_score >= 80 THEN 'verified_reporter'::user_tier
        WHEN v_new_score >= 50 THEN 'trusted'::user_tier
        WHEN v_new_score >= 20 THEN 'basic'::user_tier
        ELSE 'unverified'::user_tier
    END;

    UPDATE users SET tier = v_new_tier WHERE id = NEW.reporter_user_id;

    INSERT INTO trust_score_events (user_id, score_delta, new_score, new_tier, reason, reference_id)
    VALUES (
        NEW.reporter_user_id,
        CASE WHEN NEW.status = 'verified' THEN 2 ELSE -5 END,
        v_new_score, v_new_tier,
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
```

---

# 3. USSD Stateful Session Logic Flow

## 3.1 Redis Session Architecture

### Key Namespace Convention

```
session:{msisdn_hash}                          → HASH (active session)
session:{msisdn_hash}:history                  → LIST (last 10 user inputs)
session:{msisdn_hash}:lock                     → STRING (distributed lock, TTL 30s)
price_report:draft:{msisdn_hash}               → HASH (in-progress report)
rate_limit:{msisdn_hash}:{endpoint}:{window}   → STRING (sliding window count)
```

### Session Hash Fields

| Field | Type | Example | Description |
|---|---|---|---|
| `state` | string | `"SELECT_DISTRICT"` | Current USSD menu state |
| `last_state` | string | `"SELECT_REGION"` | Previous state for back nav |
| `region_id` | int | `1` | Selected region ID |
| `district_id` | int | `12` | Selected district ID |
| `station_id` | int | `342` | Selected station ID |
| `station_code` | string | `"SHELL-042"` | Station short code |
| `fuel_type` | string | `"petrol"` | Fuel type being reported |
| `reported_price` | float | `5650.00` | Price input by user |
| `channel` | string | `"ussd"` | Origin channel |
| `locale` | string | `"lg"` | Language code |
| `sequence` | int | `3` | Menu sequence number |
| `created_at` | epoch | `1716969600` | Session creation timestamp |
| `last_activity` | epoch | `1716969700` | Last user interaction |
| `ttl` | int | `120` | Session TTL in seconds |
| `lock_token` | string | `uuid-v4` | Distributed lock token |

## 3.2 State Transition Diagram

```
                        ┌──────────────┐
                        │    ENTRY     │
                        │  (*284*X#)   │
                        └──────┬───────┘
                               │
                               ▼
                        ┌──────────────┐
                 ┌──────│   WELCOME    │◄───────┐
                 │      │  1. Report   │        │
                 │      │  2. View     │        │
                 │      │  3. Lang     │        │
                 │      └──────┬───────┘        │
                 │             │                 │
                 │    ┌────────┴────────┐       │
                 │    ▼                 ▼       │
                 │  [1. Report]      [2. View]  │
                 │    │                 │       │
                 │    ▼                 ▼       │
           ┌──────────────┐     ┌──────────────┐│
           │SELECT_REGION │     │SELECT_REGION ││
           │(Report flow) │     │ (View flow)  ││
           └──────┬───────┘     └──────┬───────┘│
                  │                    │        │
                  ▼                    ▼        │
           ┌──────────────┐     ┌──────────────┐│
           │SELECT_       │     │SELECT_       ││
           │DISTRICT      │     │DISTRICT      ││
           └──────┬───────┘     └──────┬───────┘│
                  │                    │        │
                  ▼                    ▼        │
           ┌──────────────┐     ┌──────────────┐│
           │SELECT_       │     │VIEW_STATIONS ││
           │STATION       │     │(Top 3 cheap) ││
           └──────┬───────┘     └──────┬───────┘│
                  │                    │        │
                  ▼                    └────────┘
           ┌──────────────┐
           │SELECT_FUEL   │
           └──────┬───────┘
                  │
                  ▼
           ┌──────────────┐
           │ENTER_PRICE   │
           └──────┬───────┘
                  │
                  ▼
           ┌──────────────┐
           │CONFIRM       │
           └──────┬───────┘
                  │
          ┌───────┴───────┐
          ▼               ▼
   ┌──────────────┐ ┌──────────────┐
   │SUBMITTED     │ │WELCOME       │
   │(CON success) │ │(retry/report)│
   └──────────────┘ └──────────────┘
```

## 3.3 Core State Machine Engine

```
// Platform: Node.js 20+ or Go 1.22+
// Depends: Redis 7+, Kafka client
// Constraint: Total response < 4,000ms (carrier timeout)

const STATES = {
    WELCOME:           { menu: true,  ttl: 120 },
    SELECT_REGION:     { menu: true,  ttl: 120 },
    SELECT_DISTRICT:   { menu: true,  ttl: 120 },
    SELECT_SUBCOUNTY:  { menu: true,  ttl: 120 },
    SELECT_STATION:    { menu: true,  ttl: 120 },
    SELECT_FUEL:       { menu: true,  ttl: 120 },
    ENTER_PRICE:       { prompt: true,ttl: 120 },
    CONFIRM:           { menu: true,  ttl: 60  },
    VIEW_DISTRICT:     { menu: true,  ttl: 120 },
    VIEW_STATIONS:     { display: true,ttl: 120 },
    SUBMITTED:         { terminal: true, ttl: 30 },
    ERROR:             { terminal: true, ttl: 30 },
};

async function handleUSSDRequest(msisdn, sessionId, inputText) {
    const msisdnHash = crypto.createHash('sha256')
        .update(APP_SALT + msisdn).digest('hex');
    const sessionKey = `session:${msisdnHash}`;
    const lockKey = `session:${msisdnHash}:lock`;
    const lockToken = uuidv4();
    const lockAcquired = await redis.set(lockKey, lockToken, 'NX', 'EX', 30);

    if (!lockAcquired) {
        return composeResponse('END', 'Please try again in a moment.');
    }

    try {
        let session = await redis.hgetall(sessionKey);
        if (!session || isEmpty(session)) {
            session = {
                state: 'WELCOME', sequence: 0, channel: 'ussd',
                locale: detectLocale(msisdn), created_at: Date.now(),
            };
            await redis.hset(sessionKey, session);
            await redis.expire(sessionKey, STATES.WELCOME.ttl);
            return composeResponse('CON', formatWelcome(session.locale));
        }

        const currentState = session.state;
        const userInput = inputText.trim();

        if (userInput === '0' || userInput === '00')
            return handleBackNavigation(session, sessionKey);
        if (userInput === '000') {
            session.state = 'WELCOME'; session.sequence = 0;
            await redis.hset(sessionKey, session);
            return composeResponse('CON', formatWelcome(session.locale));
        }

        let response;
        switch (currentState) {
            case 'WELCOME':       response = await handleWelcome(session, sessionKey, userInput); break;
            case 'SELECT_REGION': response = await handleSelectRegion(session, sessionKey, userInput); break;
            case 'SELECT_DISTRICT': response = await handleSelectDistrict(session, sessionKey, userInput); break;
            case 'SELECT_SUBCOUNTY': response = await handleSelectSubcounty(session, sessionKey, userInput); break;
            case 'SELECT_STATION': response = await handleSelectStation(session, sessionKey, userInput); break;
            case 'SELECT_FUEL':   response = await handleSelectFuel(session, sessionKey, userInput); break;
            case 'ENTER_PRICE':   response = await handleEnterPrice(session, sessionKey, userInput); break;
            case 'CONFIRM':       response = await handleConfirm(session, sessionKey, userInput); break;
            case 'VIEW_DISTRICT': response = await handleViewDistrict(session, sessionKey, userInput); break;
            case 'VIEW_STATIONS': response = await handleViewStations(session, sessionKey, userInput); break;
            default:              response = await handleError(session, sessionKey);
        }

        session.sequence += 1;
        await redis.hset(sessionKey, 'sequence', session.sequence);
        await redis.hset(sessionKey, 'last_activity', Date.now());
        await redis.expire(sessionKey, STATES[session.state]?.ttl ?? 120);

        kafka.produce('ussd.session.logs', {
            msisdn_hash: msisdnHash, session_id: sessionId,
            sequence: session.sequence, state: currentState,
            user_input: maskInput(currentState, userInput),
        });
        return response;
    } finally {
        await redis.eval(
            'if redis.call("get", KEYS[1]) == ARGV[1] then redis.call("del", KEYS[1]) end',
            1, lockKey, lockToken
        );
    }
}
```

## 3.4 State Handler Implementations

### Welcome Handler

```
async function handleWelcome(session, sessionKey, input) {
    const locale = session.locale;
    switch (input) {
        case '1':  // Report Price
            session.state = 'SELECT_REGION'; session.flow = 'report';
            await redis.hset(sessionKey, session);
            return composeResponse('CON', formatText(locale, 'SELECT_REGION_PROMPT',
                { regions: await getRegionList(locale) }));
        case '2':  // View Prices
            session.state = 'SELECT_REGION'; session.flow = 'view';
            await redis.hset(sessionKey, session);
            return composeResponse('CON', formatText(locale, 'SELECT_REGION_PROMPT',
                { regions: await getRegionList(locale) }));
        case '3':  // Language
            session.state = 'WELCOME';
            await redis.hset(sessionKey, 'locale', mapLangCode(input));
            return composeResponse('CON', formatWelcome(input));
        default:
            return composeResponse('CON', formatWelcome(locale));
    }
}
```

### Price Entry Handler (with Validation)

```
async function handleEnterPrice(session, sessionKey, input) {
    const locale = session.locale;
    const price = parseFloat(input.replace(/\s/g, ''));

    if (isNaN(price) || price <= 0) {
        return composeResponse('CON', formatText(locale, 'INVALID_PRICE'));
    }

    const bounds = getPriceBounds(session.fuel_type);
    if (price < bounds.min || price > bounds.max) {
        return composeResponse('CON', formatText(locale, 'PRICE_OUT_OF_RANGE',
            { min: bounds.min, max: bounds.max }));
    }

    const median = await getMovingMedian(session.station_id, session.fuel_type);
    if (median !== null) {
        const deviation = Math.abs(price - median) / median * 100;
        if (deviation > DEVIATION_THRESHOLD_PCT) {
            session.anomaly_flagged = true;
        }
    }

    session.reported_price = price;
    session.state = 'CONFIRM';
    await redis.hset(sessionKey, session);
    return composeResponse('CON', formatText(locale, 'CONFIRM_PROMPT',
        { station: session.station_code, fuel: session.fuel_type,
          price: price.toLocaleString() }));
}

async function handleConfirm(session, sessionKey, input) {
    const locale = session.locale;
    if (input !== '1') {
        session.state = 'WELCOME';
        await redis.hset(sessionKey, session);
        return composeResponse('CON', formatText(locale, 'REPORT_CANCELLED'));
    }

    await kafka.produce('price.reports', {
        station_id: session.station_id,
        reporter_msisdn_hash: sessionKey.replace('session:', ''),
        fuel_type: session.fuel_type,
        reported_price: session.reported_price,
        channel: 'ussd', session_id: session.session_id,
        anomaly_flagged: session.anomaly_flagged || false,
        ip_address: session.ip_address,
        created_at: new Date().toISOString(),
    });

    session.state = 'SUBMITTED';
    await redis.hset(sessionKey, session);
    return composeResponse('END', formatText(locale, 'REPORT_SUCCESS'));
}
```

## 3.5 View Stations (Top 3 Cheapest) Handler

```
async function handleViewStations(session, sessionKey, input) {
    const locale = session.locale;
    const topStations = await getTopCheapestStations(
        session.region_id, session.district_id, 'petrol', 3
    );

    if (topStations.length === 0)
        return composeResponse('END', formatText(locale, 'NO_STATIONS_FOUND'));

    const lines = topStations.map((s, i) =>
        `${i+1}. ${s.name} — UGX ${s.price.toLocaleString()}/L`
    );

    return composeResponse('END',
        formatText(locale, 'TOP_CHEAPEST_HEADER') + '\n' +
        lines.join('\n') + '\n\n' + formatText(locale, 'THANK_YOU')
    );
}
```

## 3.6 Performance Budget Allocation

| Operation | Max Budget (ms) | Redis Operation | Cache Strategy |
|---|---|---|---|
| Session fetch/restore | 300 | `HGETALL` | Always hit Redis |
| Region list fetch | 400 | Cached JSON | TTL 3600s |
| District list fetch | 400 | Cached query result | TTL 1800s |
| Station list fetch | 500 | Cached query result | TTL 300s |
| Top 3 cheapest query | 800 | PostGIS + Redis cache | TTL 60s |
| Price submission (Kafka) | 300 | Fire-and-forget | Async |
| 48h median fetch | 500 | Redis sorted set | Updated 5 min |
| Response composition | 200 | In-memory | — |
| **Total budget** | **~3400** | | **Under 4000ms** |

## 3.7 WhatsApp Location Parsing

```
function parseLocationPayload(payload) {
    const location = payload.message.location;
    return {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
        crs: { type: 'name', properties: { name: 'EPSG:4326' } }
    };
}

async function findNearestStations(geoJsonPoint, radiusMeters = 5000) {
    const query = `
        SELECT s.id, s.name, s.station_code, fo.name AS operator,
               vp.price, vp.fuel_type,
               ST_AsGeoJSON(s.location) AS geometry,
               ST_Distance(s.location,
                   ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
               ) AS distance_meters
        FROM stations s
        JOIN fuel_operators fo ON fo.id = s.operator_id
        JOIN verified_prices vp ON vp.station_id = s.id AND vp.effective_until IS NULL
        WHERE s.is_active = TRUE
          AND ST_DWithin(s.location,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
        ORDER BY vp.price ASC, distance_meters ASC
        LIMIT 5
    `;
    return (await pgPool.query(query, [
        geoJsonPoint.coordinates[0], geoJsonPoint.coordinates[1], radiusMeters
    ])).rows;
}
```

## 3.8 Localized Menu Templates

All strings stored in Redis hash `i18n:{locale}:{state}` for hot-reload without deployment.

```
i18n:lg:WELCOME -> "Matano-Meters!\n1. Teeka omuwendo\n2. Kebera\n3. Olulimi"
i18n:lg:SELECT_REGION_PROMPT -> "Londa essaza lyo:\n{regions}"
i18n:lg:SELECT_DISTRICT_PROMPT -> "Londa disitulikiti:\n{districts}"
i18n:lg:CONFIRM_PROMPT -> "Kakasa:\n{station}\n{fuel}\nUGX {price}/L\n1. Kakasa\n0. Ddayo"
i18n:lg:REPORT_SUCCESS -> "Webale! Omuwendo gw'efuwa gusomeseddwa."
i18n:lg:TOP_CHEAPEST_HEADER -> "Ew'obuwanguzi esinga obusungu:"
```

---

# 4. Security Framework

## 4.1 Threat Model

```
┌──────────────────────────────────────────────────────────────────┐
│                    ATTACK SURFACE MAP                             │
├──────────────────────────────────────────────────────────────────┤
│ USSD Channel (*284*X#)                                           │
│ ├─ Spoofed MSISDN (SS7/IMS catcher)                              │
│ ├─ Automated dialing bots (SIM farms)                            │
│ └─ Bulk price flooding via GSM modem arrays                      │
│                                                                   │
│ WhatsApp Bot Channel                                              │
│ ├─ Virtual phone number farms (Twilio/TextNow/VoIP)              │
│ ├─ Automated WhatsApp Web botnets                                │
│ └─ Location spoofing (GPS faking)                                │
│                                                                   │
│ PWA / API Channel                                                 │
│ ├─ Credential stuffing + bot-driven API abuse                    │
│ ├─ Residential proxy rotation (Luminati/911)                     │
│ └─ Headless browser automation (Puppeteer/Playwright)            │
│                                                                   │
│ PRIMARY ATTACK GOALS:                                             │
│ 1. Depot-price manipulation (artificially crash/inflate)         │
│ 2. Convoy rerouting (show false cheap prices)                    │
│ 3. Competitive sabotage (undercut rival stations)                │
│ 4. Extortion (flood bad reports, demand payment to correct)      │
└──────────────────────────────────────────────────────────────────┘
```

## 4.2 Defense-in-Depth Architecture

```
LAYER 1: ACCESS CONTROL
    ┌─────────────────────────────────┐
    │  MSISDN Rate Limiting           │
    │  IP Reputation Scoring          │
    │  Device Fingerprinting (PWA)    │
    │  Proof-of-Work Challenge (USSD) │
    └─────────────────────────────────┘
                    │
                    ▼
LAYER 2: TRUST SYSTEM
    ┌─────────────────────────────────┐
    │  Trust Score (0-100)            │
    │  Tiered Authority               │
    │  Consensus Requirement          │
    │  Reputation Decay               │
    └─────────────────────────────────┘
                    │
                    ▼
LAYER 3: STATISTICAL VERIFICATION
    ┌─────────────────────────────────┐
    │  48h Moving Median Baseline     │
    │  Deviation Threshold (%)        │
    │  Price Variance Analysis        │
    │  Time-series Outlier Detection  │
    └─────────────────────────────────┘
                    │
                    ▼
LAYER 4: BEHAVIORAL DETECTION
    ┌─────────────────────────────────┐
    │  Inter-arrival Time Analysis    │
    │  Geospatial Clustering          │
    │  Session Fingerprinting         │
    │  Network ASN/Carrier Correlation│
    └─────────────────────────────────┘
                    │
                    ▼
LAYER 5: INCIDENT RESPONSE
    ┌─────────────────────────────────┐
    │  Anomaly Alert Queue            │
    │  Price Freeze Mechanism         │
    │  Station Whitelist/Blacklist    │
    │  Law Enforcement Escalation     │
    └─────────────────────────────────┘
```

## 4.3 Layer 1 — Access Control

### Rate Limiting

```
const RATE_LIMITS = {
    'price.submit': { window_ms: 3600000, max_requests: 5, burst: 2,
                      consequence: 'block_24h' },
    'ussd.dial':    { window_ms: 60000,  max_requests: 10,
                      consequence: 'block_1h' },
    'station.view': { window_ms: 60000,  max_requests: 30,
                      consequence: 'throttle_10s' },
    'auth.otp':     { window_ms: 900000, max_requests: 3,
                      consequence: 'block_perm' },
};

async function checkRateLimit(msisdnHash, endpoint) {
    const config = RATE_LIMITS[endpoint];
    if (!config) return { allowed: true };
    const now = Date.now();
    const windowKey = `ratelimit:${msisdnHash}:${endpoint}:${
        Math.floor(now / config.window_ms)}`;
    const currentCount = await redis.incr(windowKey);
    if (currentCount === 1) await redis.pexpire(windowKey, config.window_ms);
    if (currentCount > config.max_requests) {
        const blockDuration = getBlockDuration(msisdnHash, endpoint, currentCount);
        await redis.set(`blocked:${msisdnHash}:${endpoint}`, 'true', 'EX', blockDuration);
        return { allowed: false, reason: 'RATE_LIMITED', blockDuration };
    }
    return { allowed: true };
}
```

### Escalating Block Durations

| Offense Count | Block Duration |
|---|---|
| 1 | 1 hour |
| 2 | 24 hours |
| 3 | 7 days |
| 4+ | 30 days |

### IP Reputation Scoring

```
const UGANDA_CARRIER_ASNS = [
    'AS36936', 'AS36935', 'AS37277', 'AS328167', 'AS37323', 'AS328222'
];

function scoreIPReputation(ipAddress) {
    const checks = [
        checkKnownProxyList(ipAddress),
        checkResidentialProxy(ipAddress),
        checkASNCarrierMatch(ipAddress),
        checkHistoricalFraud(ipAddress),
        checkGeoVelocity(ipAddress),
    ];
    const score = checks.reduce((sum, c) => sum + c.weight, 0);
    if (score > 80) return { action: 'block', reason: 'HIGH_RISK_IP' };
    if (score > 50) return { action: 'challenge', reason: 'SUSPICIOUS_IP' };
    if (score > 20) return { action: 'tag', reason: 'LOW_REPUTATION' };
    return { action: 'allow' };
}
```

### USSD Proof-of-Work Challenge

```
const CHALLENGES = {
    en: [
        { q: "What is 12 + 7?", a: "19" },
        { q: "What is 25 - 9?", a: "16" },
        { q: "How many wheels on 3 bodas?", a: "6" },
        { q: "What is half of 50?", a: "25" },
    ],
    lg: [
        { q: "12 + 7 = ?", a: "19" },
        { q: "Boda bbiri zina magudugudu meka?", a: "6" },
    ],
};

async function shouldChallengeUser(msisdnHash, session) {
    const reportsLastHour = await redis.get(`count:${msisdnHash}:1h`) || 0;
    if (session.trust_score >= 50) return false;
    if (reportsLastHour >= 3) return true;
    if (session.trust_score < 20 && Math.random() < 0.1) return true;
    return false;
}
```

## 4.4 Layer 2 — Trust System

### Trust Score Algorithm

```
const TIER_CONFIG = {
    unverified:         { minScore: 0,  consensusRequired: 3, canReportDirect: false },
    basic:              { minScore: 20, consensusRequired: 3, canReportDirect: false },
    trusted:            { minScore: 50, consensusRequired: 0, canReportDirect: true  },
    verified_reporter:  { minScore: 80, consensusRequired: 0, canReportDirect: true  },
    station_official:   { minScore: 95, consensusRequired: 0, canReportDirect: true  },
    association_leader: { minScore: 100,consensusRequired: 0, canReportDirect: true  },
};

function calculateTrustDelta(reportOutcome, context) {
    let delta = 0;
    switch (reportOutcome) {
        case 'verified_match':        delta = +2; break;
        case 'consensus_contributed': delta = +1; break;
        case 'verified_first_mover':  delta = +3; break;
        case 'rejected_outlier':      delta = -5; break;
        case 'rejected_duplicate':    delta = -1; break;
        case 'consensus_expired':     delta = -2; break;
        case 'sybil_flagged':         delta = -25; break;
        case 'rate_limited':          delta = -10; break;
    }
    // Cap daily positive gain at +6
    return delta;
}
```

### Consensus-Based Verification

```
async function processPriceReport(report) {
    const user = await getUser(report.reporter_user_id);
    const tierConfig = TIER_CONFIG[user.tier];

    // High-trust: fast path
    if (tierConfig.canReportDirect) {
        const result = await verifyAgainstMedian(report);
        if (result.passed) {
            await publishVerifiedPrice(report);
            return { status: 'verified', method: 'high_trust_direct' };
        }
        return { status: 'rejected', reason: 'extreme_deviation' };
    }

    // Low-trust: consensus path — require 3 matching reports in 15 min
    let group = await findOpenConsensusGroup(report.station_id, report.fuel_type);
    if (!group) {
        group = await createConsensusGroup(report);  // TTL 15 min
        return { status: 'pending', method: 'consensus_initiated', group_id: group.id };
    }

    const match = await addVoteToGroup(group.id, report);
    if (group.current_votes + 1 >= group.min_required_votes) {
        const medianPrice = calculateGroupMedian(group.id);
        await publishVerifiedPrice({ ...report, reported_price: medianPrice });
        return { status: 'verified', method: 'consensus_achieved', price: medianPrice };
    }
    return { status: 'pending', method: 'consensus_waiting', group_id: group.id };
}
```

## 4.5 Layer 3 — Moving Median Anti-Cheat Engine

```
const MEDIAN_WINDOW_HOURS = 48;
const MAX_DEVIATION_PCT = 25;
const WARN_DEVIATION_PCT = 15;

async function computeMovingMedian(stationId, fuelType) {
    const cacheKey = `median:${stationId}:${fuelType}:48h`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await db.query(`
        SELECT
            percentile_cont(0.5) WITHIN GROUP (ORDER BY reported_price) AS median,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY reported_price) AS q1,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY reported_price) AS q3,
            AVG(reported_price) AS mean,
            stddev(reported_price) AS stddev,
            COUNT(*) AS sample_count
        FROM price_reports
        WHERE station_id = $1 AND fuel_type = $2
          AND created_at >= NOW() - ($3 || ' hours')::INTERVAL
          AND status IN ('verified', 'pending')
    `, [stationId, fuelType, MEDIAN_WINDOW_HOURS]);

    await redis.setex(cacheKey, 300, JSON.stringify(result.rows[0]));
    return result.rows[0];
}

async function verifyPriceAgainstMedian(report) {
    const stats = await computeMovingMedian(report.station_id, report.fuel_type);
    if (!stats || stats.sample_count < 5)
        return { passed: true, confidence: 'low', reason: 'insufficient_baseline' };

    const deviation = Math.abs(report.reported_price - stats.median) / stats.median * 100;
    if (deviation > MAX_DEVIATION_PCT)
        return { passed: false, confidence: 'high', reason: 'extreme_deviation',
                 deviation_pct: deviation, median: stats.median };
    if (deviation > WARN_DEVIATION_PCT)
        return { passed: true, confidence: 'medium', reason: 'moderate_deviation',
                 deviation_pct: deviation, median: stats.median, flagged: true };
    return { passed: true, confidence: 'high', reason: 'within_normal_range',
             deviation_pct: deviation, median: stats.median };
}
```

### Z-Score Anomaly Detection

```
async function detectPriceAnomaly(stationId, fuelType) {
    const recentPrices = await db.query(`
        SELECT reported_price FROM price_reports
        WHERE station_id = $1 AND fuel_type = $2
          AND created_at >= NOW() - INTERVAL '6 hours'
          AND status = 'verified'
        ORDER BY created_at DESC
    `, [stationId, fuelType]);

    if (recentPrices.rows.length < 3) return null;

    const prices = recentPrices.rows.map(r => parseFloat(r.reported_price));
    const mean = prices.reduce((a, b) => a + b) / prices.length;
    const stddev = Math.sqrt(
        prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length
    );
    const zScore = Math.abs(prices[0] - mean) / (stddev || 1);

    if (zScore > 3.0) {
        await db.anomaly_alerts.create({
            alert_type: 'price_spike', severity: zScore > 4 ? 'critical' : 'warning',
            station_id: stationId, fuel_type: fuelType,
            reported_price: prices[0], median_baseline: mean,
            deviation_pct: Math.abs(prices[0] - mean) / mean * 100,
        });
        return { anomaly: true, zScore, severity: zScore > 4 ? 'critical' : 'warning' };
    }
    return { anomaly: false, zScore };
}
```

## 4.6 Layer 4 — Behavioral Detection

### Inter-arrival Time Analysis

```
async function analyzeSubmissionPattern(msisdnHash) {
    const timestamps = await redis.lrange(`timestamps:${msisdnHash}`, 0, 49);
    if (timestamps.length < 10) return null;

    const intervals = [];
    for (let i = 1; i < timestamps.length; i++)
        intervals.push(timestamps[i-1] - timestamps[i]);

    const mean = intervals.reduce((a, b) => a + b) / intervals.length;
    const stddev = Math.sqrt(
        intervals.reduce((sum, i) => sum + Math.pow(i - mean, 2), 0) / intervals.length
    );
    const cv = stddev / mean;  // Coefficient of variation

    // Bot behavior: CV < 0.2 (very regular timing)
    if (cv < 0.2 && mean < 30000) {
        return { pattern: 'automated', confidence: cv < 0.1 ? 'high' : 'medium',
                 coefficient_variation: cv, mean_interval_ms: mean };
    }
    return { pattern: 'human_like', coefficient_variation: cv, mean_interval_ms: mean };
}
```

### Geospatial Sybil Cluster Detection (DBSCAN)

```
async function detectGeospatialSybil(windowMinutes = 60) {
    const clusters = await db.query(`
        SELECT ST_ClusterDBSCAN(location_lat || ',' || location_lng, 0.001, 5)
                OVER () AS cluster_id,
               COUNT(*) AS report_count,
               COUNT(DISTINCT reporter_user_id) AS unique_reporters,
               ARRAY_AGG(DISTINCT reporter_user_id) AS reporter_ids
        FROM price_reports
        WHERE created_at >= NOW() - ($1 || ' minutes')::INTERVAL
          AND location_lat IS NOT NULL AND location_lng IS NOT NULL
        GROUP BY cluster_id
        HAVING COUNT(DISTINCT reporter_user_id) >= 5 AND COUNT(*) >= 10
    `, [windowMinutes]);

    for (const cluster of clusters.rows) {
        const trustScores = await getTrustScores(cluster.reporter_ids);
        const avgTrust = trustScores.reduce((a, b) => a + b) / trustScores.length;
        if (avgTrust < 20 && cluster.report_count > 20) {
            for (const userId of cluster.reporter_ids)
                await blacklistUser(userId, 'sybil_geo_cluster');
        }
    }
}
```

## 4.7 Layer 5 — Incident Response

### Alert Severity Matrix

| Severity | Example | Response Time | Action |
|---|---|---|---|
| **Info** | Single modest deviation (15-25%) | Next business day | Log + monitor |
| **Warning** | Moderate deviation cluster | 1 hour | Flag stations, alert team |
| **Critical** | Active price manipulation attack | 15 min | Price freeze, auto-rollback |

### Emergency Price Freeze

```
async function emergencyPriceFreeze(stationId, reason) {
    await db.verified_prices.update(
        { effective_until: NOW() },
        { where: { station_id: stationId, effective_until: null } }
    );
    await db.verified_prices.create({
        station_id: stationId,
        price: (await db.stations.findById(stationId)).last_known_price,
        verification_method: 'emergency_freeze',
        effective_from: NOW(), effective_until: NOW() + INTERVAL '24 hours',
    });
    await notifyStationOperator(station.operator_id, { type: 'price_freeze',
        station_id: stationId, reason, freeze_duration: '24 hours' });
    await invalidateStationCache(stationId);
}
```

## 4.8 Uganda Data Protection & Privacy Act Compliance

```
// 1. MSISDN HASHING (Section 14: Data minimization)
//    Salted SHA-256, per-user random salt, raw MSISDN never persisted

// 2. DATA RETENTION (Section 19: Storage limitation)
//    Price reports: 12 months active | USSD logs: 6 months
//    Registration staging: 24 hours | Audit logs: 3 years

// 3. CONSENT MANAGEMENT (Section 8: Consent)
//    Consent recorded on first USSD dial (*284*1#)
//    Opt-out: *284*0#

// 4. RIGHT OF ACCESS (Section 15)
//    GET /api/v1/user/data returns all personal data
//    Response within 30 days

// 5. BREACH NOTIFICATION (Section 21)
//    DPO alerted within 24 hours
//    Affected users notified within 48 hours
//    NITA-U / Personal Data Protection Office notified
```

## 4.9 Tunable Security Parameters

| Parameter | Default | Description |
|---|---|---|
| `CONSENSUS_MIN_VOTES` | 3 | Minimum matching reports for low-trust verification |
| `CONSENSUS_WINDOW_MINUTES` | 15 | Time window for consensus group to close |
| `CONSENSUS_RANGE_PCT` | 5 | Acceptable price variance within consensus group |
| `MEDIAN_WINDOW_HOURS` | 48 | Rolling baseline calculation window |
| `MAX_DEVIATION_PCT` | 25 | Hard rejection threshold from median |
| `WARN_DEVIATION_PCT` | 15 | Soft warning threshold |
| `MAX_HOURLY_REPORTS` | 5 | Max price reports per user per hour |
| `MAX_DAILY_TRUST_GAIN` | 6 | Maximum trust score increase per day |
| `SYBIL_CLUSTER_MIN_USERS` | 5 | Minimum users to trigger geo cluster alert |
| `SYBIL_CLUSTER_MIN_REPORTS` | 10 | Minimum reports to trigger geo cluster alert |
| `ANOMALY_ZSCORE_THRESHOLD` | 3.0 | Z-score above which triggers anomaly alert |

---

*Matano-Meters — National Fuel Price Transparency Platform*
*Commissioned by Ministry of Works and Transport & MEMD, Republic of Uganda*
*Reference Architecture v1.0 — May 2026*
