# Portal presentation redesign

Branch: `ui/national-portal-redesign`, based on `main` at `70acd33`.

## Phase 1 — public portal

Implemented a compact identity/support/status utility bar, original MafutaWatch logo lockup, sign-in/registration/workspace access, seven-section primary navigation with an accessible mobile menu, and a documentary-photography hero. The homepage includes station/district/fuel search, actual operational KPIs, nine linked services, a filterable Leaflet station map, fresh-price comparisons, regional indicators, tracked-case guidance, source-linked advisories and a structured footer.

The navy `#0F2D52`, green `#008751`, amber `#F5A623`, background `#F5F7FA`, white and error-red `#D32F2F` tokens are shared by public and transactional components. Typography uses Inter when locally available, with system sans-serif fallbacks; no font CDN or frontend framework was added. Inline SVG icons are original and decorative icons are hidden from assistive technology.

Public routes: `#overview`, `#prices`, `#stations`, `#services`, `#analytics`, `#advisories`, `#about`, `#contact`, `#privacy`, `#credits`. All original workspace routes and form/API contracts remain in use. Optional district selectors have explicit accessible labels. The mobile menu exposes expanded state, closes on navigation/Escape, and registration still creates only citizens.

### Data integrity

- Public counters use `/summary`; the operational station count subtracts explicitly flagged demonstration entries. No invented visitor/savings/coverage figures are used.
- Petrol/diesel indicators are regional means weighted by the API-provided sample counts, labeled as indicators rather than a legal or guaranteed national pump price.
- Rankings require fresh non-demo petrol observations at non-demo stations. Missing data has an explicit empty state, never a synthetic chart or price.
- Map filters call the real station API. GPS is requested only through the Near me action. Search results open the existing station dialog.
- OpenStreetMap tile images use `strict-origin-when-cross-origin`, supplying the origin referrer required by its usage policy without sharing route/query/account information. Failed tile requests have a visible fallback notice; pins and linked directory results remain available. Production tile-provider capacity remains an operational concern.
- Published advisories are described as source-linked platform releases. No government endorsement or ministry identity is asserted.

### Media

Two local, original JPEGs depict Kampala traffic and a Kabale fuel station. Source, photographer, Creative Commons license and presentation changes are documented in `app/assets/README.md` and `/#credits`. A photograph is not live price evidence or a business endorsement. The service worker still caches only shell resources, not private API responses or unbounded map tiles.

### Phase 1 verification

`npm run lint` passed; `npm test` passed all 19 API/security/database checks. All 12 browser journeys passed after updating navigation helpers to use the public-to-workspace entry point. Coverage includes 360/768/1024/1440px layouts, mobile-menu Escape/navigation, actual station search, district/GPS map filtering, registration/RBAC, station dialogs, citizen complaints/replies, operator updates, staff administration, XSS-shaped content and offline API-cache exclusion. Desktop/mobile screenshots were inspected. No server code, authentication middleware, permissions or dependencies changed.

## Explicit service boundaries

There is no configured public support phone/email and no generic-contact submission API. Contact routes direct users to real tracked case/access workflows and explain this limitation. A platform administrator must supply verified organizational contacts before advertising live support. SMS/USSD/WhatsApp delivery, new privileged rider/truck roles and automatically verified government releases are not represented as working services. Rider and truck-driver experiences use citizen permissions and existing transport/consumption fields.
