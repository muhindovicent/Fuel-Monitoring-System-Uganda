# MafutaWatch Uganda — UI Wireframe Blueprint

> **App:** MafutaWatch Uganda — National Fuel Price Transparency Platform
> **File:** `app/index.html` (1621 lines)
> **Stylesheet:** `app/css/style.css` (1749 lines)
> **DOM Root:** `<body>` (dark green `#0A251C` background, `--green-dark`)

---

## 1. Page Layout Diagram — Overall DOM Structure

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  NAVBAR  (.navbar, #navbar)                              fixed top; z:1000  │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🇺🇬 MafutaWatch Uganda  [Trust: 0] [🔔] Map Stations Trip ... ☰       │ │
│  │        Fuel Price Transparency                                           │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  BREADCRUMB  (.gov-breadcrumb)                           fixed top:64; z:999│
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ Home › About Government › Regulatory Directories › MafutaWatch Uganda │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  INSTITUTIONAL PROFILE  (.gov-institutional)            padding:100px 24px 40│
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  ┌─ .gov-entity-header ─────────────────────────────────────────────┐   │
│  │  │ 🏛️ Republic of Uganda — Ministry of Energy & Mineral Development │   │
│  │  │ MafutaWatch Uganda — National Fuel Price Transparency Platform   │🇺🇬│   │
│  │  └──────────────────────────────────────────────────────────────────┘   │
│  │  ┌─ .gov-contact-grid ───────────────────────────────────────────────┐  │
│  │  │  LEFT: Digital & Correspondence   │  RIGHT: Physical Location    │  │
│  │  │  Website, Email, Twitter/X, Postal│  Street, Phone, Fax, Hours   │  │
│  │  └──────────────────────────────────────────────────────────────────┘  │
│  └─────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  LEADERSHIP FRAMEWORK  (.gov-leadership)                   padding:48px 24px│
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🏛️ Leadership & Executive Framework                                    │ │
│  │ ┌─ .gov-leader-card ─────────────────────────────────────────────────┐ │ │
│  │ │ Hon. Ruth Nankabirwa Ssentamu       Minister of State for Energy  │ │ │
│  │ │ ┌──────────────────────────┬─────────────────────────────────────┐ │ │ │
│  │ │ │ Postal: P.O. Box 7270   │ Street: Amber House, Lumumba Ave    │ │ │ │
│  │ │ │ Phone: +256 (0) 414...  │ Fax: +256 (0) 414 230 370          │ │ │ │
│  │ │ └──────────────────────────┴─────────────────────────────────────┘ │ │ │
│  │ ├────────────────────────────────────────────────────────────────────┤ │ │
│  │ │ Eng. James B. Banabeitaki  Executive Commissioner — Petroleum Supply│ │ │
│  │ │ (same contact grid layout)                                         │ │ │
│  │ ├────────────────────────────────────────────────────────────────────┤ │ │
│  │ │ Col. Johnson Mugyenyi      Chief Field Enforcement Officer         │ │ │
│  │ │ (same contact grid layout)                                         │ │ │
│  │ └────────────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  HERO  (#hero)                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ ┌─ .hero-left ─────────────────────┐ ┌─ .hero-right ────────────────┐  │ │
│  │ │ 🇺🇬 National Fuel Price Platform │ │ ┌─ .hero-stats-card ─────┐  │  │ │
│  │ │ Driving Transparency in         │ │ │ 1,200+                  │  │  │ │
│  │ │ Uganda's Fuel Market            │ │ │ active fuel pump prices │  │  │ │
│  │ │ [Find Cheapest Fuel Near Me]    │ │ │ verified today          │  │  │ │
│  │ │ [Report a Price]                │ │ │ 📍 Stations monitored:56│  │  │ │
│  │ │ ┌─ .hero-feed ────────────────┐  │ │ │ 👥 Daily users: 150k+│  │  │ │
│  │ │ │ Live Community Broadcasts   │  │ │ │ 💰 Avg savings: 12k+│  │  │ │
│  │ │ │ ⚠️ Boda Stage Alert: ...    │  │ │ └────────────────────────┘  │  │ │
│  │ │ └─────────────────────────────┘  │ └───────────────────────────┘  │  │
│  │ │ [Share a quick alert... 0/140 ] │                                 │  │
│  │ │ [📢 Broadcast]                  │                                 │  │
│  │ └──────────────────────────────────┘                                 │  │
│  └─────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  TRI-HUB INTERACTION  (.trihub-section)                                      │
│  ┌── Three Ways to Drive Change ──────────────────────────────────────────┐ │
│  │ ┌── .hub-card ──────┐ ┌── .hub-card ──────┐ ┌── .hub-card-gov ─────┐ │ │
│  │ │ 🔁 Peer-to-Peer   │ │ 📋 Citizen-to-    │ │ 🏛️ Government-to-   │ │ │
│  │ │ Driver-to-Driver  │ │ Government        │ │ Citizen Advisory    │ │ │
│  │ │ Hub               │ │ Report Consumer   │ │ Ministry Releases   │ │ │
│  │ │ [Join a Stage Room]│ │ Exploitation      │ │ [View Ministry Post]│ │ │
│  │ └──────────────────┘ │ [Report ...]       │ └─────────────────────┘ │ │
│  │                       │ └──────────────────┘                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  METRICS SECTION  (.metrics-section)                                         │
│  ┌── Platform Transparency Metrics ───────────────────────────────────────┐ │
│  │ ┌─ .metric-card ─────┐ ┌─ .metric-card ─────┐ ┌─ .metric-card ─────┐  │ │
│  │ │ 12.4k+             │ │ 420+               │ │ 24hrs              │  │ │
│  │ │ Peer Alerts Today  │ │ Ministry           │ │ Avg Gov Response   │  │ │
│  │ └────────────────────┘ │ Investigations     │ │ Time               │  │ │
│  │                       │ └────────────────────┘ └────────────────────┘  │ │
│  │ [Retail Motorists ↗]  [Station Operators ↗]                           │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  NATIONWIDE PRICE CAP MATRIX  (#priceCapMatrix)  (.gov-price-cap)            │
│  ┌── Nationwide District Price Cap Matrix ───────────────────────────────┐  │
│  │ ┌─ .gov-table ──────────────────────────────────────────────────────┐│  │
│  │ │ Region │ District │ Petrol Max │ Diesel Max │ Last Updated       ││  │
│  │ │ Central│ Kampala  │ 5,450      │ 5,650      │ 15 May 2026        ││  │
│  │ │        │ Wakiso   │ 5,480      │ 5,680      │ ...                ││  │
│  │ │ ...    │ ...      │ ...        │ ...        │ ...                ││  │
│  │ └──────────────────────────────────────────────────────────────────-┘│  │
│  └─────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  LIVE ANALYTICS  (green-mid bg)                                              │
│  ┌── Regional Price Hotspots ──────────────────────────────────────────────┐ │
│  │ ┌─ #regionCards (JS-filled) ──────────────────────────────────────────┐ │ │
│  │ └────────────────────────────────────────────────────────────────────┘ │ │
│  │ ┌─ #analyticsMiniMap (mini Leaflet, 320px) ──────────────────────────┐ │ │
│  │ └────────────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│  PLATFORM TOOLS  (#appSection)  (.tools-section)                             │
│  ┌─ .tools-tabs ──────────────────────────────────────────────────────────┐ │
│  │ [🗺️ Map] [⛽ Stations] [🚗 Trip] [💬 P2P Chat] [📝 Report]           │ │
│  │ [📋 C2G Report] [🏛️ G2C Advisory] [📊 Activity] [🏪 Operator]         │ │
│  │ [🏛️ Admin]                                                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│  ┌─ .tools-content (#mainContent) ───────────────────────────────────────┐  │
│  │  ┌─ .tools-pane.active ──────────────────────────────────────────┐   │  │
│  │  │  (content switches based on active tab — see §2 below)       │   │  │
│  │  └───────────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────────┤
│  FOOTER  (.footer-gov)                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ 🇺🇬                                                                    │ │
│  │ MafutaWatch Uganda                                                     │ │
│  │ National Fuel Price Transparency Platform                              │ │
│  │ ────────────────────────────────────────                               │ │
│  │ Data powered by crowdsourced reports & licensed station operators...   │ │
│  │ — For the People. For the Market. For Uganda. —                       │ │
│  │ © 2026 · Republic of Uganda — Ministry of Energy & Mineral Development │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘

```

### CSS Layout Strategy

| Component | Positioning | Z-Index | Key Styles |
|---|---|---|---|
| `.navbar` | `fixed; top:0; left:0; right:0` | `1000` | `height:64px; backdrop-filter:blur(12px)` |
| `.gov-breadcrumb` | `fixed; top:64px; left:0; right:0` | `999` | `backdrop-filter:blur(8px)` |
| Page sections | `scroll-padding-top:110px` (accounts for navbar+breadcrumb) | — | On `html` |
| `.tools-tabs` | `sticky` within its container | — | Horizontal scroll on mobile |
| `.modal-overlay` | `fixed; inset:0` | High | Bottom-sheet on mobile |
| `.toast` | `fixed` bottom-center | High | Auto-dismiss overlay |

---

## 2. Each Tool Pane — Individual Wireframes

### 2A. Map Pane (`#page-map`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  .map-wrapper (#mapWrapper)  height:600px                                   │
│  ┌─ .map-top-controls ────────────────────────────────────────────────────┐  │
│  │ [All Fuel ▼] [Any dist ▼] [Search station or area...       ] [✕ Clear]│  │
│  │   └─ #mapFuel    └─ #mapRadius  └─ #mapSearch               └─ btn    │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│                         ┌─── LEAFLET MAP (#map) ───┐                         │
│                         │                          │                         │
│                         │   (tile layer: OSM /     │                         │
│                         │    CartoDB dark)          │                         │
│                         │                          │                         │
│                         │   ⛽ Station markers      │                         │
│                         │   (Leaflet circleMarker   │                         │
│                         │    color-coded by price)  │  [📍 #mapLocateBtn]    │
│                         │                          │     (fixed bottom-right │
│                         │                          │      of map wrapper)    │
│                         └──────────────────────────┘                         │
│                                                                              │
│  .map-result-count (#mapResultCount)  "0 stations"                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Indicator | Implementation |
|---|---|---|
| **Loading** | Skeleton pulse overlay or spinner centered on map | `<div class="spinner"></div>` before tile load |
| **Empty** | "No stations found. Try adjusting your search or radius." in `.map-result-count` | `#mapResultCount` text update |
| **Error** | "⚠️ Map data unavailable. Retry?" toast via `#toast` | `#toast` with `.toast-error` class |
| **No Geolocation** | Fallback to Kampala center `[0.3136, 32.5811]` when `#mapLocateBtn` fails | App-level fallback in JS |
| **Mobile 768px** | `.map-top-controls` wraps to flex column; `.map-wrapper` height reduces to `400px` or `100vw` | Inline style override / responsive CSS |

**Interactive elements:** `#mapFuel` (fuel type filter), `#mapRadius` (distance filter), `#mapSearch` (text search), `#mapRadiusClear` (reset), `#mapLocateBtn` (GPS locate), `#mapResultCount` (live count). Station marker click opens `#stationModal`.

---

### 2B. Station Directory Pane (`#page-stations`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  .tools-pane  max-height:70vh; overflow-y:auto                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ Search & Filter Row                                                     │ │
│  │ [Search station or area...         ] [All ▼ └─ #listFuel]               │ │
│  │   └─ #listSearch                     └─ #listFuel                        │ │
│  │                                                                          │ │
│  │  ┌─ #stationList ─────────────────────────────────────────────────────────┐│
│  │  │  ⛽ Shell Kampala Road  |  Petrol: UGX 5,230  |  Diesel: UGX 5,450  ││ │
│  │  │  📍 Kampala Central  |  ⭐ 4.2  |  Updated: 2 min ago              ││ │
│  │  ├──────────────────────────────────────────────────────────────────────┤│ │
│  │  │  ⛽ TotalEnergies Ntinda  |  Petrol: UGX 5,450  |  Diesel: UGX 5,650││ │
│  │  │  📍 Nakawa Division  |  ⭐ 3.8  |  Updated: 15 min ago             ││ │
│  │  └──────────────────────────────────────────────────────────────────────┘│
│  │                                                                          │
│  │  ┌─ #reviewSection ─────────────────────────────────────────────────────┐│
│  │  │ ⭐ Station Reviews & Issues                                          ││
│  │  │ Station: [Select a station... ▼ └─ #reviewStation]                   ││
│  │  │ Rating:  ★★★★★  (clickable stars, .star-rating)                      ││
│  │  │ Issues: ☐ Long queues  ☐ Malfunctioning pumps  ☐ Suspected adulterated││
│  │  │ Comments: [textarea #reviewText]                                      ││
│  │  │ [Submit Review ── .btn-tool-primary]                                  ││
│  │  │ Recent Reviews: (#recentReviews)  ⭐⭐⭐⭐ "Quick service..."         ││
│  │  └──────────────────────────────────────────────────────────────────────┘│
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Modal** (`#stationModal`, `.modal-overlay` > `.modal-sheet`):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ═══ .modal-handle (drag indicator) ═══════════════════════════════════════  │
│                                                                              │
│  Station Name                                        (#modalTitle)           │
│  Operator · Area                                     (#modalSub)             │
│                                                                              │
│  ┌─ #modalPrices ──────────────────────────────────────────────────────────┐ │
│  │ Petrol: UGX 5,230        Diesel: UGX 5,450                              │ │
│  │ Last updated: 2 min ago  by 3 reports  (consensus: ✅)                  │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [📝 Report Price]  [⭐ Write Review]  [🔔 Alert Me]  [🧭 Directions →]     │
│    #modalReportBtn   #modalReviewBtn    #modalSubBtn    #modalDirectionsBtn  │
│                                                                              │
│  ⭐ Recent Reviews  (#modalReviews)                                          │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │ ⭐⭐⭐⭐  "Quick service, fair prices" — John K.  2h ago                  │ │
│  │ ⭐⭐⭐    "Long queue at peak hours" — Sarah M.   5h ago                  │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Indicator |
|---|---|
| **Loading** | `#stationList` shows skeleton cards (3 gray pillbars) |
| **Empty** | "No stations found matching your search." with muted icon |
| **Error** | Toast "⚠️ Could not load station data. Retry?" |
| **Mobile 480px** | Modal becomes bottom-sheet (`bottom:0; border-radius:16px 16px 0 0; max-height:85vh`) |

---

### 2C. Trip Planner Pane (`#page-planner`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  max-height:70vh; overflow-y:auto                                            │
│  ┌─ .tool-card ──────────────────────────────────────────────────────────┐  │
│  │ 🚗 Trip Cost Planner                                                  │  │
│  │ Calculate fuel costs and find cheapest stations on your route.        │  │
│  │                                                                       │  │
│  │ Start Location:  [Kampala Post Office            ] [📍]               │  │
│  │                   └─ #tripFrom                       #useGpsTripFrom  │  │
│  │ Destination:     [Mukono Town                     ]                   │  │
│  │                   └─ #tripTo                                          │  │
│  │                                                                       │  │
│  │ Vehicle Type:    [Toyota Corolla (8.5L/100km) ▼  ]                    │  │
│  │                   └─ #tripVehicle                                     │  │
│  │                                                                       │  │
│  │ [Calculate Trip Cost ──────────── #calcTripBtn ────────────]          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ #tripResult .route-result  (hidden initially, display:block on calc) ─┐│
│  │ 🚗 Kampala → Mukono  (35 km)                                          ││ │
│  │ ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――││ │
│  │ Fuel needed:  ~3.0 L      │  Cost: UGX 16,350                        ││ │
│  │ Cheapest en route:        │  Shell Mukono Main: UGX 5,230/L          ││ │
│  │                           │  Total Mukono: UGX 5,450/L               ││ │
│  │ [Get Directions →]         │  Save UGX 660 by fueling at Shell       ││ │
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  📍 Common Destinations  (#commonDests)                                      │
│  [Kampala → Entebbe] [Kampala → Jinja] [Kampala → Mukono] [Kampala → Gulu]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Indicator |
|---|---|
| **Loading** | Button shows spinner, text "Calculating..." |
| **Empty** | No result yet — `#tripResult` is `display:none` |
| **No route** | Toast "Could not find a route between these locations. Try different inputs." |
| **No vehicle** | Pills populated by JS from `#locList` datalist; dropdown populated dynamically |
| **Mobile 480px** | `.form-row` stacks; inputs go full-width |

---

### 2D. P2P Chat Pane (`#page-p2p`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  max-height:70vh; overflow-y:auto                                            │
│  ┌─ .tool-card ──────────────────────────────────────────────────────────┐  │
│  │ 💬 Driver-to-Driver Chat Rooms                                       │  │
│  │ Rooms organized by transport corridor.                                │  │
│  │                                                                       │  │
│  │  ┌─ #p2pRoomList ─────────────────────────────────────────────────┐   │  │
│  │  │ 🚦 Masaka Road Transporters    📍 2.3 km · 24 members  [Join] │   │  │
│  │  │ 🚦 Jinja Highway Corridor      📍 5.1 km · 18 members  [Join] │   │  │
│  │  │ 🚦 Entebbe Express Route       📍 0.8 km · 31 members  [Join] │   │  │
│  │  │ 🚦 Gulu Highway Network        📍 192 km · 9 members   [Join] │   │  │
│  │  └────────────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ #p2pActiveRoom  (hidden until Join clicked) ─────────────────────────┐  │
│  │  ┌─ #p2pChatHeader .tool-card ───────────────────────────────────┐   │  │
│  │  │ 🚦 Masaka Road Transporters                     [← Back]     │   │  │
│  │  │ 📍 2.3 km away · 24 members                                  │   │  │
│  │  └───────────────────────────────────────────────────────────────┘   │  │
│  │                                                                      │   │
│  │  ┌─ #p2pMessages .tool-card  max-height:360px ───────────────────┐   │  │
│  │  │ 🟢 John: Any traffic at Mpigi?                        10:32   │   │  │
│  │  │ 🔵 Sarah: Clear right now, just passed             👍 10:33   │   │  │
│  │  │ 🟢 John: Thanks! Fuel at Shell Mpigi?               👍 10:34   │   │  │
│  │  │ 🔵 Sarah: UGX 5,230 petrol, no queue               👍 10:35   │   │  │
│  │  └────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                      │   │
│  │  ┌─ .tool-card (message input) ───────────────────────────────────┐   │  │
│  │  │ [Type your message...                     max 280] [Send ↗]   │   │  │
│  │  │   └─ #p2pMsgInput                              #p2pSendBtn    │   │  │
│  │  │ 👍 Upvote helpful messages                    0/280            │   │  │
│  │  └───────────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Indicator |
|---|---|
| **Loading** | Skeleton room cards (3 gray rectangles) |
| **Empty rooms** | "No active chat rooms in your area yet. Be the first!" |
| **No messages** | "Be the first to message in this room! 🎉" in `#p2pMessages` |
| **Mobile** | Room list extends full width; `#p2pActiveRoom` takes over full `#page-p2p` height |

---

### 2E. Price Reporting Pane (`#page-report`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  max-height:70vh; overflow-y:auto                                            │
│  ┌─ .tool-card  (neon-dim bg) ──────────────────────────────────────────┐  │
│  │ ℹ️ If you have Trust Score ≥50, your price is published instantly.   │  │
│  │    New reporters need 3 matching inputs.                             │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌─ .tool-card ──────────────────────────────────────────────────────────┐  │
│  │ 📝 Report Fuel Price                                                  │  │
│  │ See a price? Report it. Help every Ugandan save.                      │  │
│  │                                                                       │  │
│  │ Station: [Select station...              ▼ └─ #reportStation]         │  │
│  │ Fuel Type: [Petrol ▼ #reportFuel]  Price: [5500     ] (UGX/L)        │  │
│  │                                          └─ #reportPrice (min:2000,   │  │
│  │                                                       max:10000)     │  │
│  │ Your Location: [Kampala, Nakawa          ] [📍 GPS]                   │  │
│  │                  └─ #reportLocation          #reportGpsBtn           │  │
│  │                                                                       │  │
│  │ [Submit Price Report ────────── #submitReportBtn ──────────]          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌─ #recentStationReports ───────────────────────────────────────────────┐  │
│  │ Recent reports for selected station appear here.                      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Indicator |
|---|---|
| **Loading** | Submit button shows spinner, disabled |
| **Success** | Toast "✅ Price report submitted! +10 Trust Score" with green glow |
| **Error** | Toast "⚠️ Submission failed. Try again." |
| **GPS Pending** | `#reportGpsBtn` shows "📍 Acquiring..." text; on success fills `#reportLocation` |
| **Mobile** | `.form-row` stacks vertically |

---

### 2F. C2G Exploitation Report Pane (`#page-c2g`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  max-height:70vh; overflow-y:auto                                            │
│  ┌─ .tool-card  (neon-dim bg) ──────────────────────────────────────────┐  │
│  │ ⚖️ Your report creates a tracked government ticket with a unique ID. │  │
│  │    A Ministry regulator will be assigned within 24 hrs.              │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌─ .tool-card ──────────────────────────────────────────────────────────┐  │
│  │ 📋 Report Consumer Exploitation                                       │  │
│  │                                                                       │  │
│  │ Category:  [⚠️ Suspected Adulterated Fuel   ▼ #c2gCategory]           │  │
│  │ Vehicle:   [🛵 Boda Boda Rider              ▼ #c2gVehicleType]         │  │
│  │ Station:   [Select station...               ▼ #c2gStation]            │  │
│  │ Date:      [2026-05-29 #c2gDate]   Phone:   [+256 7XX XXX XXX]       │  │
│  │                                                 └─ #c2gPhone          │  │
│  │ Description:                                                           │  │
│  │ ┌─────────────────────────────────────────────────────────────────────┐│  │
│  │ │ Describe what happened in detail...  └─ #c2gDescription            ││  │
│  │ └─────────────────────────────────────────────────────────────────────┘│  │
│  │                                                                       │  │
│  │ Evidence:                                                             │  │
│  │ ┌─ .evidence-upload-zone (#c2gUploadZone) ──────────────────────────┐ │  │
│  │ │  📎                                                              │ │  │
│  │ │  Drop files here or click to browse                               │ │  │
│  │ │  Supports JPG, PNG, PDF — max 10MB each    [Choose Files]         │ │  │
│  │ │  (hidden <input type="file" id="c2gFileInput">)                   │ │  │
│  │ └────────────────────────────────────────────────────────────────────┘ │  │
│  │  ┌─ #c2gFileList .evidence-preview-list ────────────────────────────┐  │  │
│  │  │ [📷 receipt.jpg  245KB  ✕]  [📷 pump.jpg  1.2MB  ✕]            │  │  │
│  │  └──────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │ [📨 Submit Report — Generate Ticket ── #c2gSubmitBtn ──]              │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌─ .tool-card ──────────────────────────────────────────────────────────┐  │
│  │ 🔍 Track Your Ticket                                                  │  │
│  │ [Enter ticket ID (e.g. C2G-2025-0042)   ] [🔍 Track]                  │  │
│  │   └─ #c2gTrackInput                        #c2gTrackBtn               │  │
│  │  ┌─ #c2gTrackResult ────────────────────────────────────────────────┐ │  │
│  │  │ Ticket #C2G-2026-0042 — Status: 🔴 Pending Regulator Assignment │ │  │
│  │  │ Submitted: 29 May 2026 09:15  ·  Category: Pump Tampering       │ │  │
│  │  │ SLA remaining: 22h 15m                                          │ │  │
│  │  └─────────────────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌─ .tool-card ──────────────────────────────────────────────────────────┐  │
│  │ 📋 Your Submitted Tickets  (#c2gTicketList)                           │  │
│  │ ┌────────────────────────────────────────────────────────────────────┐│  │
│  │ │ C2G-2026-0042  🔴 Pending    Pump Tampering   Total Ntinda  ⏳22h ││  │
│  │ │ C2G-2026-0038  🟡 In Review  Overpricing      Shell Jinja  ⏳ 4h  ││  │
│  │ │ C2G-2026-0021  ✅ Resolved   Adulterated Fuel  Kobil Bombo   ℹ️   ││  │
│  │ └────────────────────────────────────────────────────────────────────┘│  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Indicator |
|---|---|
| **Loading** | "Generating ticket..." spinner on `#c2gSubmitBtn` |
| **Success** | Toast "✅ Ticket C2G-2026-XXXX created! Track it below." |
| **Error** | Toast "⚠️ Submission failed. Check your connection." |
| **Empty tickets** | "No tickets yet. Submit your first report above." in `#c2gTicketList` |
| **Upload progress** | Inline "Uploading..." with percentage on preview item |
| **Upload drag-over** | `.evidence-upload-zone.dragover` — gold border + glow |
| **Mobile 480px** | `.evidence-preview-list` single column; upload zone full width |

---

### 2G. G2C Advisory Pane (`#page-g2c`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  max-height:70vh; overflow-y:auto                                            │
│  ┌─ .tool-card  (neon border) ──────────────────────────────────────────┐  │
│  │ 🏛️ Ministry of Energy & Mineral Development       ✓ Verified        │  │
│  │    Official communications from @energy.go.ug — unalterable.          │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ #g2cPostList ─────────────────────────────────────────────────────────┐  │
│  │ ┌────────────────────────────────────────────────────────────────────────┐│
│  │ │ 📜 MEMD Directive 2026/07 — Fuel Price Cap Adjustment               ││ │
│  │ │ Ministry of Energy · 28 May 2026 · 📎 PDF                           ││ │
│  │ │ ───────────────────────────────────────────────────────────────────── ││ │
│  │ │ The Ministry announces updated maximum pump prices for June 2026...  ││ │
│  │ │ [Read Full Release →]                                                ││ │
│  │ └────────────────────────────────────────────────────────────────────────┘│
│  │ ┌────────────────────────────────────────────────────────────────────────┐│
│  │ │ 📢 Public Notice: Pump Inspection Blitz — Western Region              ││ │
│  │ │ Uganda Bureau of Standards · 25 May 2026                            ││ │
│  │ │ All pumps in Mbarara, Kabarole, Kasese to be inspected w/c 1 June... ││ │
│  │ └────────────────────────────────────────────────────────────────────────┘│
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ #g2cAmaSection .tool-card ──────────────────────────────────────────┐  │
│  │ 🎤 Live Town Hall / AMA                                               │  │
│  │ Upcoming scheduled sessions with Ministry representatives.            │  │
│  │                                                                       │  │
│  │  ┌─ #g2cAmaList ────────────────────────────────────────────────────┐ │  │
│  │  │ 🟢 LIVE NOW: Fuel Pricing Q&A — Hon. Ruth Nankabirwa             │ │  │
│  │  │    Ask your questions live. 42 participants.  [Join →]           │ │  │
│  │  │                                                                  │ │  │
│  │  │ 📅 Upcoming: Diesel Adulteration Town Hall — 2 Jun 2026 15:00    │ │  │
│  │  │    Col. Johnson Mugyenyi. Submit questions in advance.           │ │  │
│  │  └──────────────────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Indicator |
|---|---|
| **Loading** | Skeleton text blocks for posts |
| **Empty** | "No official communications yet. Check back soon." |
| **No AMA** | "No upcoming town halls scheduled." in `#g2cAmaList` |
| **Mobile** | Cards stack full-width, 1-column |

---

### 2H. Activity Feed Pane (`#page-activity`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  max-height:70vh; overflow-y:auto                                            │
│  ┌─ .dash-grid ──────────────────────────────────────────────────────────┐  │
│  │ ┌─ .dash-card ─────────────────┐  ┌─ .dash-card ───────────────────┐  │  │
│  │ │  42                          │  │  38                            │  │  │
│  │ │  Reports                     │  │  Verified    (neon colored)    │  │  │
│  │ └──────────────────────────────┘  └────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ .dash-card ──────────────────────────────────────────────────────────┐  │
│  │ Trust Score                                        28                 │  │
│  │ (neon colored number, large font)                   └─ #statTrust     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Report History  (#activityList)                                             │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ 📝 Reported Petrol at Shell Kampala Road — UGX 5,230    ✅ Verified    ││ │
│  │ 🕐 2 hours ago  ·  +15 Trust Score                                      ││ │
│  ├──────────────────────────────────────────────────────────────────────────┤│
│  │ 📝 Reported Diesel at Total Ntinda — UGX 5,650          ⏳ Pending     ││ │
│  │ 🕐 5 hours ago  ·  awaiting 2 more confirmations                        ││ │
│  ├──────────────────────────────────────────────────────────────────────────┤│
│  │ 📋 C2G Report #0042 — Pump Tampering                     🔴 Open       ││ │
│  │ 🕐 1 day ago  ·  SLA remaining: 2h 15m                                  ││ │
│  └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Indicator |
|---|---|
| **Loading** | `#statTotal`/`#statVerified`/`#statTrust` show "—" with skeleton |
| **Empty** | "No activity yet. Start by reporting a price or submitting a C2G ticket." in `#activityList` |
| **Error** | Toast "⚠️ Could not load activity data." |
| **Mobile** | `.dash-grid` single column; full-width cards |

---

### 2I. Operator Dashboard Pane (`#page-operator`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  max-height:70vh; overflow-y:auto                                            │
│                                                                              │
│  ┌─ #opLogin .auth-box  (default visible) ──────────────────────────────┐  │
│  │  ⛽                                                                   │  │
│  │  Operator Login                                                       │  │
│  │  Enter your registered phone number to receive an OTP.                │  │
│  │  Phone: [+256 7XX XXX XXX         └─ #opPhone]                        │  │
│  │  [Send OTP ───────── #opLoginBtn ─────────]                           │  │
│  │  Demo: enter any number, use OTP: 123456                              │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ #opDashboard  (hidden until login) ─────────────────────────────────┐  │
│  │  Station: [Select your station...             ▼ └─ #opStation]        │  │
│  │                                                                       │  │
│  │  ┌─ .dash-grid ───────────────────────────────────────────────────┐  │  │
│  │  │ ┌─ .dash-card ─────────────┐ ┌─ .dash-card ─────────────────┐ │  │  │
│  │  │ │ UGX 5,230                │ │ UGX 5,450                    │ │  │  │
│  │  │ │ Current Petrol           │ │ Current Diesel               │ │  │  │
│  │  │ │  └─ #opCurrentPetrol     │ │  └─ #opCurrentDiesel        │ │  │  │
│  │  │ └──────────────────────────┘ └──────────────────────────────┘ │  │  │
│  │  └───────────────────────────────────────────────────────────────┘  │  │
│  │  Last updated: 15 min ago      └─ #opLastUpdate                     │  │
│  │  ┌─ #opConsistencyAlert (hidden unless triggered) ────────────────┐ │  │
│  │  │ ⚠️ Your official price differs from 3 crowd reports!          │ │  │
│  │  └────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                     │  │
│  │  ┌─ .tool-card ────────────────────────────────────────────────────┐│  │
│  │  │ Update Pump Price                                               ││  │
│  │  │ Fuel: [Petrol ▼ #opFuel]  New Price: [5400        #opPrice]    ││  │
│  │  │ [Update Official Price ──── #opUpdatePriceBtn ────]            ││  │
│  │  │ Changes are logged and audited.                                ││  │
│  │  └────────────────────────────────────────────────────────────────┘│  │
│  │                                                                     │  │
│  │  Crowd-Sourced Reports  (#opReports)                                │  │
│  │  ┌──────────────────────────────────────────────────────────────────┐│  │
│  │  │ 🟢 Petrol UGX 5,230 — 3 reports (consensus)   Trust: 85%      ││  │
│  │  │ 🟡 Diesel UGX 5,400 — 1 report (unconfirmed)  [Verify] [Dismiss]││  │
│  │  └──────────────────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**States:**

| State | Indicator |
|---|---|
| **Login loading** | `#opLoginBtn` shows spinner, text "Sending OTP..." |
| **Login error** | Toast "⚠️ Could not send OTP. Check phone number." |
| **Dashboard loading** | Metrics show "—" until station selected |
| **Empty crowd reports** | "No crowd reports for your station yet." in `#opReports` |
| **Consistency alert** | `#opConsistencyAlert` shows with warning styling when official ≠ crowd prices |
| **Mobile** | `.auth-box` full width; `#opDashboard` single column |

---

### 2J. Admin Dashboard Pane (`#page-admin`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  max-height:70vh; overflow-y:auto                                            │
│                                                                              │
│  ┌─ #adminLogin .auth-box  (default visible) ──────────────────────────┐  │
│  │  🏛️                                                                 │  │
│  │  Admin Access                                                        │  │
│  │  Authorized MEMD & URA personnel only.                               │  │
│  │  Access Code: [••••••••               └─ #adminPass]                 │  │
│  │  [Access Dashboard ─────── #adminLoginBtn ────────]                  │  │
│  │  Demo code: admin123                                                 │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ #adminDash  (hidden until login) ───────────────────────────────────┐  │
│  │  ┌─ .admin-subnav ──────────────────────────────────────────────────┐│  │
│  │  │ [📊 Dashboard] [🚨 Fraud] [🏪 Stations] [📋 Audit] [⚙️ Config]   ││  │
│  │  │   active tab          .admin-tab  [🔑 API]                       ││  │
│  │  └──────────────────────────────────────────────────────────────────┘│  │
│  │                                                                      │  │
│  │  ┌─ .admin-pane.active ────────────────────────────────────────────┐│  │
│  │  │  (sub-panes switch — see below)                                ││  │
│  │  └─────────────────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Admin Sub-Pane: Dashboard (`#adminPane-dashboard`)

```
┌─ .admin-pane.active ────────────────────────────────────────────────────────┐
│  ┌─ .bento-grid ─────────────────────────────────────────────────────────┐  │
│  │ ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │  │
│  │ │ 📊           │ │ ✅       │ │ 🚨       │ │ 🗺️       │ │ 👥       │ │  │
│  │ │ 1,247        │ │ 1,102    │ │ 23       │ │ 12       │ │ 0        │ │  │
│  │ │ Total Reports│ │ Verified │ │ Active   │ │ Active   │ │ DAU      │ │  │
│  │ │              │ │          │ │ Flags    │ │ API      │ │          │ │  │
│  │ │              │ │          │ │ (yellow) │ │ Stations │ │          │ │  │
│  │ │ (wide)       │ │          │ │          │ │ (neon)   │ │          │ │  │
│  │ └──────────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │  │
│  │ ┌──────────┐                                                        │  │
│  │ │ ⚠️       │                                                        │  │
│  │ │ 0        │                                                        │  │
│  │ │ Rejected │                                                        │  │
│  │ │ (red)    │                                                        │  │
│  │ └──────────┘                                                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ⏱️ SLA Compliance — Active C2G Investigations  (#slatTimerContainer)     │
│  ┌─ .gov-sla-card ──────────────────────────────────────────────────────┐ │
│  │ 🎫 C2G-2026-0042  |  Total Ntinda  |  ⏱️ 22:15:03  |  🔴 Critical │ │
│  │ 🎫 C2G-2026-0038  |  Shell Jinja   |  ⏱️ 04:22:11  |  🟡 Warning  │ │
│  │ 🎫 C2G-2026-0035  |  Kobil Bombo   |  ⏱️ 00:45:08  |  ✅ Active   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  📈 National Average Petrol Price (30-Day Trend)  (#priceChart)           │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  ┌─── Canvas (Chart.js line chart, 180px height) ─────────┐         │ │
│  │  │  📈 5,600 ┤                                             │         │ │
│  │  │           │    ╱╲       ╱╲                              │         │ │
│  │  │  5,400 ┤  ╱╱  ╲╲  ╱╱  ╲╲                             │         │ │
│  │  │           │ ╱      ╲╲╱      ╲                            │         │ │
│  │  │  5,200 ┤─╱───────────────────╲───                       │         │ │
│  │  │           │                         ╲                     │         │ │
│  │  └──────────┴──────────────────────────────────────────────┘         │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  📍 Regional Price Comparison  (#adminRegions)                            │
│  (JS-rendered list/cards)                                                 │
└───────────────────────────────────────────────────────────────────────────┘
```

#### Admin Sub-Pane: Fraud Queue (`#adminPane-fraud`)

```
┌─ .admin-pane ──────────────────────────────────────────────────────────┐
│  🚨 Real-Time Fraud Queue                                  🔴 23 flagged│
│  Outliers caught by the Moving Median Engine.                          │
│                                                                        │
│  ┌─ #fraudTableContainer ────────────────────────────────────────────┐ │
│  │ ┌─ .fraud-table ────────────────────────────────────────────────┐ │ │
│  │ │ Timestamp  │ Station │ UserID │ Reported │ Current │ Dev % │ │ │ │
│  │ │───────────┼─────────┼────────┼──────────┼─────────┼───────│ │ │ │
│  │ │ 10:32:15  │ Shell   │ U-0421 │ 3,200    │ 5,230   │ -39%  │ │ │ │
│  │ │           │ Kamwokya│        │          │         │       │ │ │ │
│  │ │ 10:28:03  │ Total   │ U-0893 │ 6,800    │ 5,450   │ +25%  │ │ │ │
│  │ │           │ Ntinda  │        │          │         │       │ │ │ │
│  │ └───────────┴─────────┴────────┴──────────┴─────────┴───────┘ │ │ │
│  │  (Each row has Action buttons: [✅ Approve] [✕ Dismiss] [⏸ Throttle])│ │
│  └──────────────────────────────────────────────────────────────────┘ │
│  Moving Median Engine v2.1 · Last scan: just now                     │
└───────────────────────────────────────────────────────────────────────┘
```

#### Admin Sub-Pane: Station Management (`#adminPane-stations`)

```
┌─ .admin-pane ──────────────────────────────────────────────────────────┐
│  [📄 KYC Pipeline]  [✅ Whitelisted]    .admin-sub-tab                 │
│                                                                        │
│  ┌─ #kycPipeline ────────────────────────────────────────────────────┐ │
│  │ 📄 Corporate KYC Pipeline                            🟡 5 pending │ │
│  │ ┌───────────────────────────────────────────────────────────────┐ │ │
│  │ │ ┌─ #kycCardList ──────────────────────────────────────────┐  │ │ │
│  │ │ │ 🏪 Shell Uganda — Kampala Road Branch                  │  │ │ │
│  │ │ │ Contact: +256 700 123 456  ·  License: FUEL/2026/0421 │  │ │ │
│  │ │ │ [📄 View Docs]  [✅ Approve]  [✕ Reject]              │  │ │ │
│  │ │ ├────────────────────────────────────────────────────────┤  │ │ │
│  │ │ │ 🏪 TotalEnergies — Jinja Main                         │  │ │ │
│  │ │ │ Contact: +256 700 654 321  ·  License: FUEL/2026/0387 │  │ │ │
│  │ │ │ [📄 View Docs]  [✅ Approve]  [✕ Reject]              │  │ │ │
│  │ │ └────────────────────────────────────────────────────────┘  │ │ │
│  │ └───────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ #whitelistContainer  (hidden unless Whitelisted tab active) ───┐ │
│  │ [Search whitelisted operators...        └─ #whitelistSearch]    │ │
│  │ ┌─ #whitelistTableBody ───────────────────────────────────────┐ │ │
│  │ │ Shell Kampala Road  ·  Token: mw_...a3f1  ·  📊 1200 req/d│ │ │
│  │ └────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

#### Admin Sub-Pane: Audit Trail (`#adminPane-audit`)

```
┌─ .admin-pane ──────────────────────────────────────────────────────────┐
│  📋 Immutable System Ledger                            [🔄 Refresh]   │
│  Read-only historical timeline of pricing alterations.                │
│                                                                       │
│  [All Channels ▼     └─ #auditChannelFilter]                          │
│  [All Types ▼        └─ #auditTypeFilter]                             │
│                                                                       │
│  ┌─ #auditLedgerContainer ──────────────────────────────────────────┐ │
│  │ ┌─ .fraud-table ───────────────────────────────────────────────┐ │ │
│  │ │ Timestamp │ StationID │ Modified By │ Prev │ New │ Channel  │ │ │
│  │ │──────────┼───────────┼─────────────┼──────┼─────┼──────────│ │ │
│  │ │ 10:30:01 │ STN-042   │ op_shell_km  │ 5230 │ 5200 │ web     │ │ │
│  │ │ 10:15:22 │ STN-089   │ ussd_user_*  │ 5450 │ 5400 │ ussd    │ │ │
│  │ │ 09:58:44 │ STN-042   │ admin_001    │ 5450 │ 5200 │ admin   │ │ │
│  │ └──────────┴───────────┴─────────────┴──────┴─────┴──────────┘ │ │
│  │                                                               │ │
│  └───────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘

Filters: #auditChannelFilter values: all, web, ussd, wa, api, operator, admin
         #auditTypeFilter values: all, price_update, fraud_dismiss, operator_auth, broadcast
```

#### Admin Sub-Pane: System Config (`#adminPane-config`)

```
┌─ .admin-pane ──────────────────────────────────────────────────────────┐
│  [🌳 Channel Hierarchy]  [📢 Broadcast Console]                        │
│                                                                        │
│  ┌─ #configHierarchy ────────────────────────────────────────────────┐ │
│  │ 🌳 Channel Content Management                    [+ Add Region]  │ │
│  │  ┌─ #hierarchyTree ────────────────────────────────────────────┐  │ │
│  │  │ 🌍 Central                    [+ Add District]             │  │ │
│  │  │  ├─ 📍 Kampala                (14 stations)                │  │ │
│  │  │  ├─ 📍 Wakiso                (9 stations)                 │  │ │
│  │  │  └─ 📍 Mukono                (6 stations)                 │  │ │
│  │  │ 🌍 Western                                              │  │ │
│  │  │  └─ 📍 Mbarara               (8 stations)                 │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ #configBroadcast  (hidden unless Broadcast tab active) ────────┐ │
│  │ 📢 Emergency Broadcast Console — reaches all channels instantly │ │
│  │                                                                 │ │
│  │ Alert Title: [National Fuel Supply Update     └─ #broadcastTitle]│ │
│  │ Message:                                                         │ │
│  │ ┌───────────────────────────────────────────────────────────────┐│ │
│  │ │ Official message from MEMD...  └─ #broadcastMsg              ││ │
│  │ └───────────────────────────────────────────────────────────────┘│ │
│  │ Target: ☑ All Web Users  ☑ WhatsApp Transporters  ☑ USSD Users  │ │
│  │ Districts: [Leave blank for all, or comma-separated     ]       │ │
│  │                                                                 │ │
│  │ [📢 Send Emergency Broadcast ── #sendBroadcastBtn ──]           │ │
│  │ ┌─ #broadcastList (history of sent broadcasts) ────────────────┐│ │
│  │ │ 📢 "Fuel Supply Update" — 28 May 2026 14:30  |  🔄 12k recv ││ │
│  │ └──────────────────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

#### Admin Sub-Pane: API Console (`#adminPane-api`)

```
┌─ .admin-pane ──────────────────────────────────────────────────────────┐
│  🔑 API Credentials Console                       [+ Generate Token] │
│  Generate and manage secure Bearer tokens.                            │
│                                                                       │
│  ┌─ #apiTokenList ──────────────────────────────────────────────────┐ │
│  │ ┌───────────────────────────────────────────────────────────────┐ │ │
│  │ │ 🟢 Shell Kampala Road     mw_live_a3f1...2b8c  500 req/min  │ │ │
│  │ │   Created: 15 May 2026   Last used: 2 min ago  [🔄 Cycle]    │ │ │
│  │ ├───────────────────────────────────────────────────────────────┤ │ │
│  │ │ 🟢 Total Ntinda           mw_live_9c4e...7d2f  500 req/min  │ │ │
│  │ │   Created: 20 Apr 2026   Last used: 15 min ago  [🔄 Cycle]   │ │ │
│  │ └───────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  📋 API Quick Reference                                                 │
│  Endpoint base: https://api.mafutawatch.go.ug/v2                       │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ 🟢 GET   /prices          — Fetch live prices                     ││
│  │ 🟡 POST  /prices/report   — Submit price report                   ││
│  │ 🟡 POST  /stations/sync   — Auto-sync forecourt prices            ││
│  │ 🔴 PATCH /fraud/action    — Moderate flagged entry                ││
│  └─────────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────────┘
```

**Admin States:**

| State | Indicator |
|---|---|
| **Login loading** | Spinner on `#adminLoginBtn` |
| **Login error** | Toast "⚠️ Invalid access code." |
| **Dashboard loading** | Bento-grid shows "—" until data loads |
| **Empty fraud queue** | "🎉 No flagged reports. All prices within baseline." in `#fraudTableBody` |
| **No KYC pending** | "No pending KYC applications." in `#kycCardList` |
| **KYC docs loading** | Inline spinner on [📄 View Docs] click |
| **SLA all clear** | "No active SLA tickets. All investigations within 24-hour compliance window." in `#slatTimerContainer` |
| **Empty audit** | "No audit entries match your filters." in `#auditLedgerBody` |
| **Broadcast sending** | Spinner on `#sendBroadcastBtn`, text "Publishing..." |
| **Token generation** | Modal showing new Bearer token once, with copy button and "Store this securely" warning |
| **Mobile 768px** | `.admin-subnav` horizontal scroll; `.bento-grid` wraps 2 columns |

---

## 3. gov.za Directory Block Detail

### 3A. Breadcrumb Navigation Bar

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ .gov-breadcrumb  (fixed; top:64px; backdrop-filter:blur(8px))               │
│                                                                              │
│  <a href="https://www.mafutawatch.go.ug">Home</a>                           │
│  <span class="sep">›</span>                                                  │
│  <a href="#">About Government</a>                                            │
│  <span class="sep">›</span>                                                  │
│  <a href="#">Regulatory Directories</a>                                      │
│  <span class="sep">›</span>                                                  │
│  <span class="current">MafutaWatch Uganda</span>  (--gov-gold color)        │
│                                                                              │
│  CSS: font-size:0.72rem; color:var(--text-dim); gap:6px; padding:8px 24px   │
│       background:rgba(10,37,28,0.95); border-bottom:1px solid --gov-divider │
│  Mobile: font-size:0.65rem; padding:6px 12px                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3B. Split-Column Directory Profile Block

```
┌─ .gov-institutional (padding:100px 24px 40px; gradient bg) ──────────────┐
│  ┌─ .gov-entity-header (flex, gap:32px, max-width:1200px; margin:0 auto) │
│  │                                                                        │
│  │  ┌─ .gov-entity-title (flex:1; min-width:280px) ───────────────────┐  │
│  │  │ .gov-badge: 🏛️ Republic of Uganda — Ministry of Energy &        │  │
│  │  │                Mineral Development                              │  │
│  │  │             (inline-flex; gold-dim bg; gold text; pill-shape)    │  │
│  │  │                                                                  │  │
│  │  │  <h1>MafutaWatch Uganda <span>— National Fuel Price             │  │
│  │  │       Transparency Platform</span></h1>                          │  │
│  │  │  (h1: font-size 1.6rem; gold span for subtitle)                  │  │
│  │  └──────────────────────────────────────────────────────────────────┘  │
│  │                                                                        │
│  │  ┌─ .gov-entity-seal ───────────────────────────────────────────────┐  │
│  │  │  🇺🇬  (80×80px circle, gold border, flex centered)              │  │
│  │  └──────────────────────────────────────────────────────────────────┘  │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ .gov-contact-grid (CSS Grid, 2 columns, gap:1px, gold-divider borders) │
│  │                                                                          │
│  │  ┌─ .gov-contact-block (LEFT) ───────────────────────────────────────┐  │
│  │  │  <h4>Digital & Correspondence</h4>                                │  │
│  │  │                                                                    │  │
│  │  │  ● <span class="label">Website</span>                             │  │
│  │  │    <span class="value">www.mafutawatch.go.ug</span>  (neon link)  │  │
│  │  │                                                                    │  │
│  │  │  ● <span class="label">Email</span>                               │  │
│  │  │    <span class="value">info@mafutawatch.go.ug</span> (neon link)  │  │
│  │  │                                                                    │  │
│  │  │  ● <span class="label">Twitter / X</span>                         │  │
│  │  │    <span class="value">@MafutaWatchUG</span> (neon link)          │  │
│  │  │                                                                    │  │
│  │  │  ● <span class="label">Postal Address</span>                      │  │
│  │  │    <span class="value">P.O. Box 7270, Kampala, Uganda</span>      │  │
│  │  └────────────────────────────────────────────────────────────────────┘  │
│  │                                                                          │
│  │  ┌─ .gov-contact-block (RIGHT) ──────────────────────────────────────┐  │
│  │  │  <h4>Physical Location</h4>                                        │  │
│  │  │                                                                    │  │
│  │  │  ● <span class="label">Street Address</span>                      │  │
│  │  │    <span class="value">Plot 29/33, Lumumba Avenue,                │  │
│  │  │    Amber House, 3rd Floor, Kampala, Uganda</span>                  │  │
│  │  │                                                                    │  │
│  │  │  ● <span class="label">Phone</span>                               │  │
│  │  │    <span class="value">+256 (0) 417 892 500</span>                │  │
│  │  │                                                                    │  │
│  │  │  ● <span class="label">Fax</span>                                 │  │
│  │  │    <span class="value">+256 (0) 414 230 370</span>                │  │
│  │  │                                                                    │  │
│  │  │  ● <span class="label">Office Hours</span>                        │  │
│  │  │    <span class="value">Mon–Fri, 08:00–17:00 (EAT)</span>          │  │
│  │  └────────────────────────────────────────────────────────────────────┘  │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Contact item CSS pattern:                                                   │
│  .gov-contact-item { display:flex; gap:8px; font-size:0.82rem;              │
│                      margin-bottom:10px; line-height:1.5 }                   │
│  .label { min-width:90px; text-transform:uppercase; letter-spacing:0.04em;  │
│           font-size:0.75rem; color:var(--text-dim); font-weight:600 }        │
│  .value { color:var(--white); word-break:break-word }                        │
│                                                                              │
│  Mobile (768px): .gov-contact-grid → single column                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3C. Leadership Cards

```
┌─ .gov-leadership (padding:48px 24px; gold-dim bottom border) ───────────┐
│  ┌─ .gov-leadership-inner (max-width:1200px; margin:0 auto)             │
│  │  <h2>🏛️ Leadership & Executive Framework</h2>                       │
│  │      (gold color; ::after pseudoelement flex-fill divider line)      │
│  │                                                                      │
│  │  ┌─ .gov-leader-card ────────────────────────────────────────────┐  │
│  │  │  <h3>Hon. Ruth Nankabirwa Ssentamu</h3>                       │  │
│  │  │  <div class="leader-role">Minister of State for Energy</div>  │  │
│  │  │      (gold uppercase, letter-spacing:0.06em)                   │  │
│  │  │                                                               │  │
│  │  │  ┌─ .gov-leader-details (CSS Grid 2col, 1px gap) ──────────┐  │  │
│  │  │  │  ┌─ .detail-item ─────────────────────────────────────┐  │  │
│  │  │  │  │  <span class="ld-label">Postal</span>              │  │  │
│  │  │  │  │  <span class="ld-value">P.O. Box 7270...</span>    │  │  │
│  │  │  │  └────────────────────────────────────────────────────┘  │  │
│  │  │  │  ┌─ .detail-item ─────────────────────────────────────┐  │  │
│  │  │  │  │  <span class="ld-label">Street</span>              │  │  │
│  │  │  │  │  <span class="ld-value">Amber House...</span>      │  │  │
│  │  │  │  └────────────────────────────────────────────────────┘  │  │
│  │  │  │  ┌─ .detail-item ─────────────────────────────────────┐  │  │
│  │  │  │  │  <span class="ld-label">Phone</span>               │  │  │
│  │  │  │  │  <span class="ld-value">+256 (0) 414 254 811</span>│  │  │
│  │  │  │  └────────────────────────────────────────────────────┘  │  │
│  │  │  │  ┌─ .detail-item ─────────────────────────────────────┐  │  │
│  │  │  │  │  <span class="ld-label">Fax</span>                 │  │  │
│  │  │  │  │  <span class="ld-value">+256 (0) 414 230 370</span>│  │  │
│  │  │  │  └────────────────────────────────────────────────────┘  │  │
│  │  │  └────────────────────────────────────────────────────────┘  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │
│  │                                                                     │
│  │  (Two more identical cards for Eng. James B. Banabeitaki            │
│  │   and Col. Johnson Mugyenyi, same layout, different phone numbers)  │
│  │                                                                     │
│  │  .gov-leader-card CSS:                                              │
│  │    background: var(--green-mid); border: 1px solid --gov-divider;   │
│  │    border-radius: 12px; padding: 24px; margin-bottom: 20px         │
│  │                                                                     │
│  │  .detail-item CSS:                                                  │
│  │    background: rgba(10,37,28,0.4); padding:10px 16px;               │
│  │    font-size:0.8rem; display:flex; gap:6px                          │
│  │  .ld-label: min-width:60px; text-transform:uppercase; font-size:0.7rem│
│  │  .ld-value: color:var(--white)                                      │
│  │                                                                     │
│  │  Mobile (768px): .gov-leader-details → single column               │
│  └─────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 4. State Maps

### 4A. Loading States

| Pane | Loading Indicator | Implementation |
|---|---|---|
| **Map** | Spinner overlay centered on `#mapWrapper` before tiles render | `<div class="spinner" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)">` |
| **Stations** | 3 skeleton cards: gray pill + 2 text lines, `@keyframes pulse` opacity cycling | `div.skeleton` with `--green-card` bg, `border-radius:8px`, `height:48px`, animated opacity |
| **Trip** | Button text → "Calculating..." + spinner icon on `#calcTripBtn` | `#calcTripBtn` innerHTML swap, `disabled` attribute |
| **P2P** | 3 skeleton room cards (icon circle + 2 text lines) | Same skeleton card pattern |
| **Report** | Button spinner + "Submitting..." on `#submitReportBtn` | Button state change |
| **C2G** | Button spinner + "Generating Ticket..." on `#c2gSubmitBtn` | Button state change; upload shows per-file "Uploading 47%" |
| **G2C** | Skeleton posts (header + date + 3 text lines, repeated 2×) | `.skeleton-post` with pulsing gray bars |
| **Activity** | Metrics show "—" or skeleton numbers; list shows skeleton items | `#statTotal.textContent = "—"`, skeleton list items |
| **Operator** | Login button spinner; dashboard metrics show "—" | `#opCurrentPetrol.textContent = "—"` |
| **Admin** | Login button spinner; bento-grid shows "—" | Same pattern as operator |

### 4B. Empty States

| Pane | Empty Message | Element |
|---|---|---|
| **Map** | "No stations found. Try adjusting your search or radius." | `#mapResultCount` |
| **Stations** | "No stations found matching your search." | `#stationList` inner empty div |
| **Trip** | (No result yet — `#tripResult` hidden) | `display:none` |
| **P2P** | "No active chat rooms in your area yet. Be the first!" | `#p2pRoomList` |
| **P2P Messages** | "Be the first to message in this room! 🎉" | `#p2pMessages` |
| **Report** | "No recent reports for this station." | `#recentStationReports` |
| **C2G Tickets** | "No tickets yet. Submit your first report above." | `#c2gTicketList` |
| **C2G Track** | "No ticket found with that ID." | `#c2gTrackResult` |
| **G2C** | "No official communications yet. Check back soon." | `#g2cPostList` |
| **G2C AMA** | "No upcoming town halls scheduled." | `#g2cAmaList` |
| **Activity** | "No activity yet. Start by reporting a price!" | `#activityList` |
| **Operator Reports** | "No crowd reports for your station yet." | `#opReports` |
| **Admin Fraud** | "🎉 No flagged reports. All prices within baseline." | `#fraudTableBody` |
| **Admin KYC** | "No pending KYC applications." | `#kycCardList` |
| **Admin SLA** | "No active SLA tickets. All investigations within 24-hour compliance window." | `#slatTimerContainer` |
| **Admin Audit** | "No audit entries match your filters." | `#auditLedgerBody` |
| **Admin Hierarchy** | "No regions configured. Click [+ Add Region] to start." | `#hierarchyTree` |
| **Admin Broadcasts** | "No broadcasts sent yet." | `#broadcastList` |
| **Admin API** | "No API tokens generated yet." | `#apiTokenList` |
| **Station Reviews** | "No reviews yet. Be the first!" | `#recentReviews` / `#modalReviews` |

### 4C. Error States

All errors use the `#toast` element (`.toast` class):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  .toast (#toast) — fixed bottom-center, z-index high                        │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ⚠️ {error message}                                    [✕] auto-dismiss │  │
│  │   background: var(--green-mid); border-left: 3px solid var(--red);     │  │
│  │   border-radius: 10px; box-shadow: var(--shadow-card)                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Scenario | Toast Message |
|---|---|
| Map tile load failure | "⚠️ Map tiles failed to load. Check your connection." |
| Map geolocation error | "⚠️ Could not get your location. Showing Kampala default." |
| Station list fetch error | "⚠️ Could not load station data. Retry?" |
| Trip calculation failure | "⚠️ Could not calculate route. Try different locations." |
| P2P room join error | "⚠️ Could not join room. Try again." |
| P2P message send error | "⚠️ Message failed to send." |
| Report submit error | "⚠️ Price report submission failed. Try again." |
| C2G submit error | "⚠️ Failed to submit exploitation report. Check your connection." |
| C2G track error | "⚠️ Could not find ticket. Check the ID and try again." |
| Operator login error | "⚠️ Could not send OTP. Check phone number." |
| Admin login error | "⚠️ Invalid access code." |
| Admin fraud action error | "⚠️ Failed to process fraud action." |
| Admin KYC auth error | "⚠️ Failed to authorize operator." |
| Admin broadcast error | "⚠️ Broadcast failed to send." |
| File upload error | "⚠️ File upload failed. Try a smaller file (max 10MB)." |
| Network offline | "⚠️ You are offline. Some features may be unavailable." |

### 4D. Mobile Responsive Layout

#### Breakpoint: 768px (Tablet)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Changes applied at max-width:768px:                                     │
│                                                                          │
│  ┌─ .navbar ───────────────────────────────────────────────────────────┐ │
│  │  .navbar-links         →  display:none (hamburger menu replaces)    │ │
│  │  .navbar-links.open   →  flex column, position absolute below nav  │ │
│  │  .hamburger           →  display:block                              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .gov-breadcrumb ───────────────────────────────────────────────────┐ │
│  │  font-size: 0.65rem; padding: 6px 12px                              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .gov-institutional ────────────────────────────────────────────────┐ │
│  │  padding: 90px 12px 24px;                                            │ │
│  │  .gov-entity-title h1 { font-size: 1.2rem; }                        │ │
│  │  .gov-contact-grid → single column (grid-template-columns: 1fr)     │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .gov-leadership ───────────────────────────────────────────────────┐ │
│  │  padding: 32px 12px;                                                │ │
│  │  .gov-leader-details → single column                                │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .tools-tabs ───────────────────────────────────────────────────────┐ │
│  │  overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling  │ │
│  │  (horizontal scrollable tab bar)                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .tools-pane ───────────────────────────────────────────────────────┐ │
│  │  max-height: none  (full height, no scroll trap on modals)          │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .trihub-grid ──────────────────────────────────────────────────────┐ │
│  │  → single column (grid or flex column)                              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .metrics-grid, .value-grid ────────────────────────────────────────┐ │
│  │  → single column                                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .admin-subnav ─────────────────────────────────────────────────────┐ │
│  │  overflow-x: auto; white-space: nowrap                              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .bento-grid ───────────────────────────────────────────────────────┐ │
│  │  → 2 columns                                                        │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ #stationModal .modal-sheet ────────────────────────────────────────┐ │
│  │  → bottom-sheet: bottom:0; border-radius:16px 16px 0 0; width:100% │ │
│  │    max-height:85vh; transform:translateY(0)                         │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Breakpoint: 480px (Mobile)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Additional changes at max-width:480px:                                  │
│                                                                          │
│  ┌─ Body ──────────────────────────────────────────────────────────────┐ │
│  │  font-size: 14px                                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .navbar-brand ─────────────────────────────────────────────────────┐ │
│  │  font-size: 0.95rem; small { font-size: 0.55rem }                  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .hero ────────────────────────────────────────────────────────────┐ │
│  │  .hero-stats-card { padding: 16px }                                 │ │
│  │  .hero-actions { flex-direction: column }                           │ │
│  │  .hero-actions button { width: 100% }                               │ │
│  │  #heroVerifiedCount { font-size: 2rem }                             │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ Form elements ────────────────────────────────────────────────────┐ │
│  │  .form-row → flex-column                                           │ │
│  │  select, input, textarea { font-size: 16px }  (prevent zoom)      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ .gov-table ────────────────────────────────────────────────────────┐ │
│  │  min-width: auto; font-size: 0.75rem                                │ │
│  │  .cap-val { font-size: 0.82rem }                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ #page-planner, #page-p2p, etc. ────────────────────────────────────┐ │
│  │  .tool-card { padding: 12px }                                       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ #mapWrapper ───────────────────────────────────────────────────────┐ │
│  │  height: 50vh  (reduced from 600px)                                 │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ #stationModal .modal-sheet ────────────────────────────────────────┐ │
│  │  padding: 20px 16px                                                  │ │
│  │  .modal-title { font-size: 1.1rem }                                 │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ Button rows in modal ─────────────────────────────────────────────▞ │
│  │  #modalReportBtn etc. → stack 2×2 grid                              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4E. Dark Theme Color Mapping

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  CSS Custom Properties — MafutaWatch Dark Theme                              │
│  Applied on :root in style.css                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  SURFACES                                                                    │
│  ────────────────────────────────────────────────────────────────────────────│
│  --green-dark:    #0A251C  │  Page background (`body`), map, dark cards     │
│  --green-mid:     #0F3328  │  Cards, contact blocks, leader cards, inputs  │
│  --green-card: rgba(0,0,0,0.04) │  Subtle card overlay                      │
│                                                                              │
│  BORDERS & DIVIDERS                                                          │
│  ────────────────────────────────────────────────────────────────────────────│
│  --green-border: rgba(255,255,255,0.08)  │  Input borders, card borders     │
│  --gov-divider:  rgba(255,255,255,0.06)  │  Grid dividers, section borders  │
│  --divider-gray: rgba(255,255,255,0.06)  │  Generic dividers                │
│                                                                              │
│  TEXT                                                                        │
│  ────────────────────────────────────────────────────────────────────────────│
│  --white:        #ffffff     │  Primary content, headings, values           │
│  --text-muted:   #94a3b8     │  Help text, timestamps, secondary labels    │
│  --text-dim:     #64748b     │  Muted labels, breadcrumb, captions          │
│                                                                              │
│  ACCENTS & STATES                                                            │
│  ────────────────────────────────────────────────────────────────────────────│
│  --neon:         #76FF03     │  Primary CTA, active tab, verified badge,    │
│                               │  links, success indicators                  │
│  --neon-dim:  rgba(118,255,3,0.15) │  Ghost buttons, alert banners          │
│  --neon-glow: 0 0 20px rgba(118,255,3,0.15) │  Button shadows              │
│  --gov-gold:     #D4A843     │  Breadcrumb current, badges, section titles, │
│                               │  leader roles, SLA ticket IDs               │
│  --gov-gold-dim: rgba(212,168,67,0.12) │  Badge backgrounds, section border │
│  --yellow:       #eab308     │  Warning, SLA warning timer, fraud count     │
│  --red:          #ef4444     │  Errors, SLA critical timer, rejections      │
│                                                                              │
│  SHADOWS                                                                     │
│  ────────────────────────────────────────────────────────────────────────────│
│  --shadow-card:  0 4px 24px rgba(0,0,0,0.3)      │  Modal, toast, cards    │
│  --shadow-neon:  0 0 30px rgba(118,255,3,0.08)   │  Neon hover glow        │
│                                                                              │
│  TYPOGRAPHY                                                                  │
│  ────────────────────────────────────────────────────────────────────────────│
│  --font:     'Inter', -apple-system, system-ui, sans-serif                  │
│  --font-mono:'JetBrains Mono', 'Cascadia Code', Consolas, monospace         │
│  --heading-font: 'Inter', -apple-system, system-ui, sans-serif              │
│                                                                              │
│  BORDER RADIUS                                                               │
│  ────────────────────────────────────────────────────────────────────────────│
│  --radius-sm: 10px   │  Buttons, small cards, inputs                        │
│  --radius-md: 16px   │  Large cards, modal sheet                            │
│  --radius-lg: 24px   │  Hero sections                                       │
│                                                                              │
│  GOVERNMENT INSTITUTIONAL OVERLAYS (embedded <style> in index.html)          │
│  ────────────────────────────────────────────────────────────────────────────│
│  --gov-gold:      #D4A843    │  Seal, table headers, section accents       │
│  --gov-gold-dim: rgba(212,168,67,0.12)  │  Badge backgrounds               │
│  --gov-cream:     #F5F0E8    │  (reserved for future light mode)           │
│  --gov-stone:     #E8E0D0    │  (reserved for future light mode)           │
│  --gov-seal:      #1B3A2D    │  Table header background                     │
│                                                                              │
│  SCROLLBAR                                                                   │
│  ────────────────────────────────────────────────────────────────────────────│
│  track: --green-dark (#0A251C)                                               │
│  thumb: --neon (#76FF03), border-radius: 3px                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix A — Key DOM References Quick Lookup

| Element ID | Pane | Type | Purpose |
|---|---|---|---|
| `#map` | Map | Leaflet div | Interactive map canvas |
| `#mapSearch`, `#mapFuel`, `#mapRadius` | Map | Input/Select | Map filters |
| `#mapLocateBtn` | Map | Button | GPS geolocation |
| `#mapResultCount` | Map | Div | Live station count |
| `#stationList` | Stations | Div | Station directory items |
| `#listSearch`, `#listFuel` | Stations | Input/Select | Station filters |
| `#reviewSection` | Stations | Div | Review form + recent |
| `#stationModal` | Global | Modal overlay | Station detail bottom-sheet |
| `#tripFrom`, `#tripTo` | Trip | Input | Route origin/destination |
| `#tripVehicle` | Trip | Select | Vehicle fuel consumption |
| `#tripResult` | Trip | Div | Calculated route output |
| `#p2pRoomList` | P2P | Div | Chat room directory |
| `#p2pActiveRoom` | P2P | Div | Active chat container |
| `#p2pMessages` | P2P | Div | Message scroll area |
| `#p2pMsgInput` | P2P | Input | Chat text entry |
| `#reportStation`, `#reportFuel`, `#reportPrice` | Report | Select/Input | Price report form |
| `#reportGpsBtn` | Report | Button | GPS fill for location |
| `#c2gCategory`, `#c2gVehicleType`, `#c2gStation` | C2G | Select | Exploitation form |
| `#c2gUploadZone` | C2G | Div | Drag-drop file area |
| `#c2gFileList` | C2G | Div | Upload preview items |
| `#c2gTrackInput` | C2G | Input | Ticket ID lookup |
| `#c2gTicketList` | C2G | Div | User's submitted tickets |
| `#g2cPostList` | G2C | Div | Ministry posts feed |
| `#g2cAmaList` | G2C | Div | Town hall / AMA entries |
| `#activityList` | Activity | Div | User's report history |
| `#opLogin`, `#opDashboard` | Operator | Div | Toggle login/dashboard |
| `#opStation`, `#opFuel`, `#opPrice` | Operator | Select/Input | Price management |
| `#opReports` | Operator | Div | Crowd report cards |
| `#adminLogin`, `#adminDash` | Admin | Div | Toggle login/dashboard |
| `#adminPane-dashboard` | Admin | Div | Bento-grid + SLA + charts |
| `#slatTimerContainer` | Admin | Div | SLA compliance cards |
| `#priceChart` | Admin | Canvas | Chart.js line chart |
| `#adminPane-fraud` | Admin | Div | Fraud queue table |
| `#fraudTableBody` | Admin | Table body | Flagged report rows |
| `#adminPane-stations` | Admin | Div | KYC + whitelist |
| `#kycCardList` | Admin | Div | Pending KYC applications |
| `#adminPane-audit` | Admin | Div | Ledger table + filters |
| `#auditLedgerBody` | Admin | Table body | Immutable price change rows |
| `#adminPane-config` | Admin | Div | Hierarchy tree + broadcast |
| `#hierarchyTree` | Admin | Div | Region/District/Station tree |
| `#sendBroadcastBtn` | Admin | Button | Emergency broadcast |
| `#adminPane-api` | Admin | Div | Token management |
| `#apiTokenList` | Admin | Div | Generated tokens |
| `#toast` | Global | Toast | All error/success notifications |

---

## Appendix B — Tab Navigation Mapping

```
.tools-tab ID           data-pane     →   .tools-pane ID        Content
──────────────────────────────────────────────────────────────────────────
#mapPaneBtn              "map"         →   #page-map              Leaflet map + controls
#stationsPaneBtn         "stations"    →   #page-stations         Directory + reviews
#tripPaneBtn             "planner"     →   #page-planner          Trip cost calculator
#p2pPaneBtn              "p2p"         →   #page-p2p              Chat rooms
#reportPaneBtn           "report"      →   #page-report           Price reporting form
#c2gPaneBtn              "c2g"         →   #page-c2g              Exploitation form + tickets
#g2cPaneBtn              "g2c"         →   #page-g2c              Ministry posts + AMAs
#activityPaneBtn         "activity"    →   #page-activity         User stats + history
#opPaneBtn               "operator"    →   #page-operator         Station operator dashboard
#adminPaneBtn            "admin"       →   #page-admin            MEMD admin panel
```

Tab switching is handled by the `switchPage()` JS function which:
1. Removes `.active` from all `.tools-tab` and `.tools-pane` elements
2. Adds `.active` to the clicked tab and corresponding pane
3. Calls `scrollIntoView({behavior:'smooth'})` on `#appSection`

---

## Appendix C — SLA Timer Visual State Table

| Timer State | CSS Class | Color | Animation | Threshold |
|---|---|---|---|---|
| **Active** (default) | — | `var(--neon)` | None | > 8h remaining |
| **Warning** | `.sla-timer.warning` | `var(--yellow)` | None | ≤ 8h remaining |
| **Critical** | `.sla-timer.critical` | `var(--red)` | `slaPulse` 1s infinite (opacity oscillation) | ≤ 4h remaining / breached |

SLA badge: `.sla-badge.active` (neon) or `.sla-badge.breached` (red with pulse).
