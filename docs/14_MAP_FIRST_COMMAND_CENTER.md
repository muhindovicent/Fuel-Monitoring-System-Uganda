# Map-first mobility portal and energy command center

Feature branch: `ui/map-first-command-center`. This extends the previously verified portal redesign, using the Node.js 24 / Express 5 / PostgreSQL application from `main` (`70acd33`). The original UI delivery preserved its server/API/authentication/migration contracts. Subsequent hosting changes are documented in [Hosted staging deployment](15_HOSTED_STAGING.md).

## Design A — mobility intelligence

- Sticky identity/account header and public navigation: Home, Find Fuel, Price Comparison, Trip Planner, Citizen Services, Community, Reports & Insights.
- Exact requested hero headline, **“Find Affordable Fuel. Drive Smarter.”**, with real nearby-discovery, comparison and price-report actions. The existing licensed Kampala/Kabale photographs retain visible source/license attribution; no official logos or endorsements were added.
- The shared station explorer is immediately below the hero/search area and also powers the full Find Fuel view. Desktop has a search/results rail on the left and a large Leaflet map on the right. Mobile has floating controls and an initially collapsed, expandable results sheet.
- Filters use the actual complete paginated station-register response: station/operator/area search, canonical district or registered city/area, fuel, fresh published-price order, 6/24/48-hour freshness, fresh-verified-only and consent-based GPS radius/distance.
- Known district names match the district exactly: “Jinja” does not accidentally include “Jinja Road” in Kampala. Broad station-name search remains available independently.
- Cards show station identity, recorded price, provenance, update time and optional straight-line distance. Card selection highlights and pans to its pin; keyboard/mouse pin selection highlights and reveals the associated card. The existing station detail/report/follow/directions/review/history workflows remain connected.
- Nearby sorting uses real shared coordinates and Haversine distance, not an invented road route. Denied location permission leaves the directory usable and explicitly states that no distance filter was applied. Location is held only in memory and cleared on logout.
- Public KPIs, fresh petrol/diesel indicators, regional charts, recent accepted updates and operational station distribution derive from the existing APIs. Demonstration/stale records are labeled and excluded from fresh verified rankings. No inventory availability, national coverage, visitor/savings statistics or predictions are invented.

### Discovery module and limits

`app/js/discovery.js` owns filtering, rendering, selection, keyboard interaction, GPS consent and map cleanup. Pure filter/distance functions have meaningful regression coverage. It uses the existing Leaflet dependency, no geocoder or additional framework. A ResizeObserver keeps maps aligned after sidebar/container size changes.

Cards are incrementally rendered in batches of 50. The map initially renders the first 250 matches and tells users to narrow large result sets; selecting a further loaded card can add its pin. Filtering is currently client-side over the curated register loaded via the existing paginated API, not a new server search contract.

OpenStreetMap requests retain an origin-only cross-origin referrer and visible attribution. Map-library/tile failure has an honest fallback; directory filtering and station details remain available. Basemap delivery still depends on the external tile provider.

## Design B — authorized command center

The reusable navy-sidebar/white-surface shell includes collapse/expand, account identity, actual notifications, breadcrumbs, role-aware tabs, KPI cards, data tables, accepted-data charts, map panels and responsive mobile navigation.

| Existing role | Prioritized presentation |
|---|---|
| Administrator | National Energy Command Center, user verification/access, station registration, operator approvals, cases, sourced notices, audit and actual `/health/ready` status |
| Inspector | Assigned investigations from accessible case records, assignment/status filtering, evidence/conversation access, server-owned deadlines and authorized case decisions |
| Analyst | Default price-intelligence view, fuel filtering, regional comparisons, actual accepted daily history, CSV exports, public station-network discovery and read-only activity records |
| Assigned operator | Assigned station profile/current prices, audited pump-price editor, public station history/map actions, station-relevant observations/directives and scoped integration credentials |
| Citizen | Own reports/cases/notifications, journey shortcuts, and editable private-motorist/boda/truck defaults using the same citizen role |

No new privileged rider, truck-driver, government or regulator role was created. Station operators cannot enter analyst/admin APIs; analysts cannot access moderation or operator APIs. The server remains the authorization boundary.

Case-assignment filtering is explicitly scoped to the currently loaded page (50 records), not represented as an exhaustive server-side assignee search. Readiness confirms the existing endpoint's database/schema check; it is not an uptime/capacity prediction. Historical charts show returned accepted daily updates without fabricating missing dates or a continuous national index. Role changes remain an administrative CLI operation; the frontend only offers supported account actions.

## Accessibility and interaction

- Verified at 360, 768, 1024 and 1440px without document overflow.
- Visible focus states, native dialogs, skip-to-content, keyboard-operable station pins, expanded-state controls, Escape closure/focus restoration, and inert background content behind mobile workspace navigation.
- Mobile filter controls use 16px inputs to avoid automatic iOS focus zoom and touch-sized actions. Search remains anonymous; changing filters does not open authentication unexpectedly.
- Real loading skeletons expose busy/status state; decorative skeletons and icons do not obscure accessibility text. Reduced-motion preferences disable shimmer/transitions and map panning animation.
- Native minimum-length attributes match the existing backend requirements. Failures preserve form entries and do not acknowledge unconfirmed submissions.
- Shell cache v6 includes the new module. Private API data, evidence and unbounded map tiles remain excluded from the offline cache.

## Verification record

Each implementation phase was verified before the next phase:

1. Foundation: lint and all 8 then-existing public browser journeys passed.
2. Discovery: all 23 then-current API/discovery checks and 13 public/stakeholder browser journeys passed.
3. Command center: all 23 checks and 18 workspace/stakeholder browser journeys passed.
4. Interaction hardening found and fixed the canonical district/road-name ambiguity; mobile workflows now explicitly expand their results sheet.
5. Final: `npm run lint` passed; **`npm test`: 24 passed** (19 existing API/security checks plus 5 discovery checks); **`npm run test:e2e`: 32 passed**. The shell-v6 offline test also passed after the cache-version update. `npm audit --audit-level=moderate` reported 0 known vulnerabilities; `git diff --check` passed.

Local verification used Node.js 24.22.1 and installed Edge Chromium on Windows. CI continues to use Playwright Chromium. Public and workspace screenshots were inspected at all requested widths. New browser journeys cover bidirectional selection, actual API-published price records, analyst CSV/fuel filtering, a real case assignment/decision, assigned-operator profile/history/map access, denied GPS, missing map library, mobile sheets and reduced-motion loading. Tests retain existing server rate limits and security assertions.

The running local instance was additionally checked at **http://localhost:3030**: readiness/summary returned HTTP 200, and the actual desktop homepage and 360px explorer rendered successfully. Its 60 demonstration entries and absence of operational price data are accurately labeled. Ignored preview images are `.local-data/map-first-desktop.png` and `.local-data/map-first-mobile.png`.

## Remaining boundaries

- A live deployment needs its own approved station records, source notices and published support/controller contact details. No generic support-contact API is fabricated.
- There is no live stock/queue telemetry, predictive pricing, automated external notifications or automatically authenticated government-release service. The UI does not advertise them as functional.
- At larger register volumes, server-side advanced filters/assignee pagination and a production-suitable tile plan should be validated; current controls accurately describe their loaded-record scope.
- The inherited Docker Compose failure from run `41464598346` was subsequently fixed by quoting the tmpfs mount options in commit `93f0a78`. GitHub verification run `41591212909` passed, including Linux Docker Compose HTTPS/runtime-role checks. Hosted deployment is recorded separately in [Hosted staging deployment](15_HOSTED_STAGING.md).
- Safari/Firefox/device testing, a formal WCAG audit and production load testing remain distinct rollout checks; the recorded results above are the checks actually executed.
