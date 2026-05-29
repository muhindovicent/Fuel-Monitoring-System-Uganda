# MafutaWatch Uganda — National Fuel Price Transparency Platform

**Ministry of Energy and Mineral Development (MEMD)** | **Republic of Uganda**

---

## Repository Structure

```
D:\FUEL SYSTEM UGANDA\
│
├── README.md                               # This file — project overview
├── index.html                              # Project documentation entry page
├── MAFUTAWATCH_UGANDA_FULL_SYSTEM.md       # Full system implementation reference (1490 lines)
│
├── app\
│   ├── index.html                          # PWA shell — gov.za directory layout
│   ├── css\
│   │   └── style.css                       # Institutional government design system
│   ├── js\
│   │   ├── app.js                          # All application logic (~2300 lines)
│   │   └── data.js                         # Station, operator, seed data
│   ├── manifest.json                       # PWA manifest
│   └── service-worker.js                   # Offline cache strategy
│
├── docs\
│   ├── 01_SYSTEM_TOPOGRAPHY.md             # Cloud infra diagram, data flows, scaling
│   ├── 02_PRICE_VERIFICATION.md            # (placeholder) Verification pipeline spec
│   ├── 03_USSD_SESSION_FLOW.md             # Redis state machine, menu handlers, i18n
│   ├── 04_SECURITY_FRAMEWORK.md            # 5-layer Sybil defense, trust engine, rate limiting
│   ├── 05_SITE_MAP.md                      # App navigation tree, component hierarchy
│   ├── 06_ERD.md                           # Entity Relationship Diagram — data model
│   └── 07_UI_WIREFRAME.md                  # gov.za directory layout wireframe blueprint
│
└── sql\
    └── 001_schema_ddl.sql                  # Full PostgreSQL DDL: PostGIS, partitioning, RLS
```

## Deliverables Summary

| # | Deliverable | File | Key Highlights |
|---|---|---|---|
| **1** | System Topography Mapping | `docs/01_SYSTEM_TOPOGRAPHY.md` | Cloud-infra Mermaid diagram; Kafka event bus; 7 worker microservices; CDN→API Gateway→Queue→Worker→DB pipeline |
| **2** | Database Schema DDL | `sql/001_schema_ddl.sql` | 18 tables; PostGIS `GEOGRAPHY(POINT,4326)` spatial indexing; monthly partitioning; trust score triggers; RLS policies |
| **3** | USSD Session Flow | `docs/03_USSD_SESSION_FLOW.md` | Redis hash state machine with 12 states; distributed locking; Kafka-published reports; 3.4s budget; Luganda/Runyakitara i18n |
| **4** | Security Framework | `docs/04_SECURITY_FRAMEWORK.md` | 5-layer defense; moving median anti-cheat; consensus verification; geospatial DBSCAN SIM farm detection |
| **5** | Site Map | `docs/05_SITE_MAP.md` | Full navigation tree; tool pane hierarchy; component dependency graph |
| **6** | Entity Relationship Diagram | `docs/06_ERD.md` | localStorage data model; relationship graph; field reference tables |
| **7** | UI Wireframe Blueprint | `docs/07_UI_WIREFRAME.md` | gov.za directory layout; breadcrumb → profile block → leadership → tool panes hierarchy |

## Design Direction

The application is modeled after the **South African Government contact directory** ([gov.za/contact-directory/soe](https://www.gov.za/about-government/contact-directory/soe/central-energy-fund-cef)) — institutional breadcrumb hierarchy, split-column metadata blocks, and leadership framework rows — while integrating real-time fuel price mapping, C2G ticketing with SLA enforcement, P2P corridor chat, G2C advisory board, and a nationwide District Price Cap matrix.

## Feature Overview

- **Smart Map** — Leaflet-based with radius filters, station clustering, turn-by-turn directions
- **Trip Cost Planner** — From/To/Distance-based petrol/diesel cost estimation
- **Price Reporting** — Citizen-submitted prices with GPS verification and receipt upload
- **Station Directory** — Searchable station list with trust scores, reviews, price history
- **P2P Corridor Chat** — Real-time chat rooms for truck drivers/boda boda riders along major routes
- **C2G Exploitation Ticketing** — File complaints with vehicle-type categorization, receipt evidence, 24h SLA enforcement
- **G2C Advisory Board** — Verified government advisories, AMA sessions, broadcast alerts
- **District Price Cap Matrix** — Nationwide table showing legal maximum prices per district with auto-flagging of breaches
- **Operator Console** — Station operators manage prices, view reports, KYC pipeline
- **Admin Analytics** — Fraud detection engine, SLA timer dashboard, audit ledger, trust scoring
- **PWA Offline** — Service worker caching, manifest install prompt, offline data queue

## Stack

- **Frontend:** Vanilla JS PWA + Leaflet/OpenStreetMap
- **Persistence:** localStorage under `mafuta_watch_v2` key
- **Routing:** OSRM-based trip calculations (open endpoint)
- **Maps:** OpenStreetMap tiles + Leaflet routing machine
- **Design:** Government institutional (inspired by gov.za directory layout)

## Core Architecture Decisions

1. **Single-page PWA** — All features in one HTML shell with tab-based navigation for offline-first mobile use
2. **localStorage as primary store** — Zero backend dependency; `mafuta_watch_v2` key holds all entities
3. **gov.za directory as structural template** — Institutional layout signals high trust and regulatory authority
4. **Tiered trust system** — Graduated reputation from anonymous citizen reports to verified operator/admin roles
5. **SLA enforcement via countdown timer** — C2G tickets auto-flag if investigation exceeds 24h window

## Scaling Targets

- 150,000 concurrent USSD/WhatsApp sessions during peak hours
- < 4,000ms USSD response (carrier timeout compliance)
- < 500ms PWA API P95 latency for spatial queries
- 12-month data retention with auto-archival

## Regulatory Compliance

- Uganda Data Protection and Privacy Act (2019)
- NITA-U e-Government standards alignment
- Bank of Uganda financial data accuracy guidelines

---

*Platform commissioned by Ministry of Energy and Mineral Development, Republic of Uganda*
*Reference Architecture v2.0 — May 2026*
