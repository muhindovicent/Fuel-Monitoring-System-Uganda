# PWA ↔ PostgreSQL API integration — foundation

The original `app/index.html`, `js/app.js`, styles, manifest and Leaflet map are preserved.

## Mode behavior
- **No reachable API:** yellow DEMO banner, pre-existing sample station data remain visible, all legacy workflows are demonstrations, not official submissions.
- **Reachable API:** green CONNECTED banner. The station list is replaced with server records, each price originates from a moderated `verified_prices` row, and the price report form posts to `/api/v1/reports` instead of changing localStorage.
- Admin login now authenticates at `/api/v1/auth/login`, maintains short-lived JWT in memory only, and shows a separate server-backed moderation and station creation dashboard.
- The legacy operator OTP and simulated token console are disabled. No real operator registration is exposed.
- If the API becomes unreachable during submission, no local report is promoted as authoritative. Reloading may show demo mode; banner makes source clear.

## Configure in development
Serve the frontend at `http://localhost:5500/app/` (not file://), API at `http://localhost:3000`. Set `window.MAFUTA_API_BASE = 'http://localhost:3000/api/v1'` in `app/js/api-config.js`. Add your exact PWA origin to `FRONTEND_ORIGINS`. For production, use HTTPS and ideally reverse-proxy the API to `/api/v1` on the same origin. Do not commit private keys to `api-config.js`. The API base URL is public information, not a secret.

## Verification
1. Visit `/api/v1/health`; it must return `status: ok`.
2. PWA shows CONNECTED, and no fictional `STATIONS_DATA` records remain in the live station directory.
3. Admin can authenticate, add a station, and see it in the public station list.
4. Citizen report returns `pending` and DOES NOT alter the displayed station price.
5. Inspector/admin can verify report; then and only then the station's displayed price changes.
6. Analyst can list but cannot verify; unauthenticated users cannot create stations.
7. Remove API connectivity and verify visible DEMO banner; reconnect and reload for current server state.

## Incomplete
This is an incremental integration, not a full PWA conversion: demo-only chat/reviews/C2G/analytics still use localStorage and must be migrated or disabled for public launch. The legacy price-cap display uses examples, not lawful price ceilings. Existing service worker cached assets are version-bumped for this release.
