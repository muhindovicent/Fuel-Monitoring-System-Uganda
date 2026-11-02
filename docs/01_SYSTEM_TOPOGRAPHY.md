# MafutaWatch Uganda — System Topography Mapping

> Historical proposal. The implemented v3 architecture is in [09_ARCHITECTURE.md](09_ARCHITECTURE.md). Kafka, Redis, USSD/WhatsApp workers and scaling targets below are not implemented services or verified operating claims.

## 1. End-to-End Cloud Infrastructure Diagram

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
│  Gateway)       │  │ (Cloud API)      │  │              │  │  Events)         │
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

## 2. Data Flow: USSD Price Report Submission

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

## 3. Data Flow: WhatsApp Location-Based Query

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

## 4. PWA Data Flow

```
Browser → Service Worker (cached UI shell)
     │
     ▼
Fetch /api/v1/stations?lat=0.3136&lng=32.5811&radius=5000
     │
     ▼
API Gateway → JWT validation (optional, public endpoints unauthenticated)
     │
     ▼
PWA Backend
     ├──► Check Redis price cache (TTL 60s)
     ├──► If miss:
     │     └──► PostGIS spatial query → PostgreSQL
     ├──► Return GeoJSON FeatureCollection
     │
     ▼
Browser → Leaflet renders interactive heat map
     │
     ▼
Service Worker → caches response in IndexedDB for offline use
```

## 5. Asynchronous Processing Contract

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

## 6. Infrastructure Scaling Parameters

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
*Diagram version: v1.0 — Last updated: 2026-05-29*
