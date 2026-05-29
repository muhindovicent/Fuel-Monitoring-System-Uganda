# Matano-Meters — The National Fuel Price Transparency Platform

**Ministry of Works and Transport** | **Ministry of Energy and Mineral Development (MEMD)** | **Republic of Uganda**

---

## Repository Structure

```
D:\FUEL SYSTEM UGANDA\
│
├── README.md                          # This file — project overview
│
├── docs\
│   ├── 01_SYSTEM_TOPOGRAPHY.md        # Cloud infra diagram, data flows, scaling
│   ├── 02_PRICE_VERIFICATION.md       # (placeholder) Verification pipeline spec
│   ├── 03_USSD_SESSION_FLOW.md        # Redis state machine, menu handlers, i18n
│   └── 04_SECURITY_FRAMEWORK.md       # 5-layer Sybil defense, trust engine, rate limiting
│
└── sql\
    └── 001_schema_ddl.sql             # Full PostgreSQL DDL: PostGIS, partitioning, RLS
```

## Deliverables Summary

| # | Deliverable | File | Key Highlights |
|---|---|---|---|
| **1** | System Topography Mapping | `docs/01_SYSTEM_TOPOGRAPHY.md` | Cloud-infra Mermaid diagram; Kafka event bus; 7 worker microservices; CDN→API Gateway→Queue→Worker→DB pipeline; GeoJSON location routing for WhatsApp |
| **2** | Database Schema DDL | `sql/001_schema_ddl.sql` | 18 tables; PostGIS `GEOGRAPHY(POINT,4326)` spatial indexing; monthly partition by `pg_partman`; trust score auto-triggers; materialized view for nearest-cheapest queries; RLS policies per Uganda Data Protection Act |
| **3** | USSD Session Flow | `docs/03_USSD_SESSION_FLOW.md` | Redis hash state machine with 12 states; distributed locking (`SET NX EX`); Kafka-published price reports; 3.4s budget (under 4s carrier timeout); Luganda/Runyakitara i18n via hot-reloadable Redis hashes |
| **4** | Security Framework | `docs/04_SECURITY_FRAMEWORK.md` | 5-layer defense: rate limiting → trust tiers → moving median anti-cheat → behavioral clustering → incident response; 48h rolling median with Z-score anomaly detection; consensus verification requiring 3 matching reports within 15 min; geospatial DBSCAN cluster detection for SIM farms |

## Core Architecture Decisions

1. **Asynchronous ingestion via Kafka** — All inbound reports land in a topic before processing, preventing backpressure during peak 150k concurrent requests
2. **PostGIS for spatial workloads** — `ST_DWithin` with GiST indexes on `GEOGRAPHY(Point, 4326)` enables sub-50ms 5km-radius lookups
3. **Redis as session authority** — USSD state is ephemeral; Redis TTL (120s) handles carrier timeouts and abandoned sessions automatically
4. **Tiered trust, not binary** — Sybil resistance via gradual reputation rather than hard gates, preventing false positives against legitimate new users
5. **Monthly partitioning** — `price_reports` and `ussd_session_logs` are time-partitioned for query performance and retention management

## Scaling Targets

- 150,000 concurrent USSD/WhatsApp sessions during peak hours
- < 4,000ms USSD response (carrier timeout compliance)
- < 500ms PWA API P95 latency for spatial queries
- 12-month data retention with auto-archival

## Regulatory Compliance

- Uganda Data Protection and Privacy Act (2019)
  - MSISDN salted SHA-256 hashing at rest
  - Raw MSISDN purged from staging after 24h
  - Consent recorded on first interaction
  - Right of access / erasure API endpoints
- NITA-U e-Government standards alignment
- Bank of Uganda financial data accuracy guidelines

---

*Platform commissioned by Ministry of Works and Transport, Republic of Uganda*
*Reference Architecture v1.0 — May 2026*
