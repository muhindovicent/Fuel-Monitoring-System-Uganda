# Matano-Meters — USSD Stateful Session Logic Flow

## 1. Redis Session Architecture

### Key Namespace Convention

```
session:{msisdn_hash}                          → HASH (active session)
session:{msisdn_hash}:history                  → LIST (last 10 user inputs)
session:{msisdn_hash}:lock                     → STRING (distributed lock, TTL 30s)
price_report:draft:{msisdn_hash}               → HASH (in-progress price report)
rate_limit:{msisdn_hash}:{endpoint}:{window}   → STRING (sliding window count)
```

### Session Hash Fields

| Field | Type | Example | Description |
|---|---|---|---|
| `state` | string | `"SELECT_DISTRICT"` | Current USSD menu state |
| `last_state` | string | `"SELECT_REGION"` | Previous state for back navigation |
| `region_id` | int | `1` | Selected region ID |
| `district_id` | int | `12` | Selected district ID |
| `subcounty_id` | int | `89` | Selected subcounty ID |
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

## 2. State Transition Diagram

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
                 │      │  3. Lang (EN │        │
                 │      │     /LG/NY)  │        │
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

## 3. Core State Machine Pseudocode

```
// ============================================================================
// USSD Session Engine — Core Loop
// ============================================================================
// Platform: Node.js 20+ (or Go 1.22+)
// Depends: Redis 7+, Kafka client
// Constraint: Total response must complete in < 4,000ms (carrier timeout)

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
    // Step 1: Resolve session from Redis (200ms budget)
    const msisdnHash = crypto
        .createHash('sha256')
        .update(APP_SALT + msisdn)
        .digest('hex');

    const sessionKey = `session:${msisdnHash}`;

    // Step 2: Acquire distributed lock (prevent concurrent USSD requests)
    const lockKey = `session:${msisdnHash}:lock`;
    const lockToken = uuidv4();
    const lockAcquired = await redis.set(lockKey, lockToken, 'NX', 'EX', 30);

    if (!lockAcquired) {
        // Duplicate request in flight — return safe fallback
        return composeResponse('END', 'Please try again in a moment.');
    }

    try {
        // Step 3: Load or create session
        let session = await redis.hgetall(sessionKey);

        if (!session || isEmpty(session)) {
            // New session — first dial-in
            session = {
                state: 'WELCOME',
                sequence: 0,
                channel: 'ussd',
                locale: detectLocale(msisdn),    // infer from MSISDN prefix or prior pref
                created_at: Date.now(),
            };
            await redis.hset(sessionKey, session);
            await redis.expire(sessionKey, STATES.WELCOME.ttl);

            return composeResponse('CON', formatWelcome(session.locale));
        }

        // Step 4: State machine transition
        const currentState = session.state;
        const userInput = inputText.trim();

        // Handle special inputs
        if (userInput === '0' || userInput === '00') {
            // Go back
            return handleBackNavigation(session, sessionKey);
        }
        if (userInput === '000') {
            // Restart to main menu
            session.state = 'WELCOME';
            session.sequence = 0;
            await redis.hset(sessionKey, session);
            return composeResponse('CON', formatWelcome(session.locale));
        }

        // Step 5: Route to current state handler
        let response;
        switch (currentState) {
            case 'WELCOME':
                response = await handleWelcome(session, sessionKey, userInput);
                break;
            case 'SELECT_REGION':
                response = await handleSelectRegion(session, sessionKey, userInput);
                break;
            case 'SELECT_DISTRICT':
                response = await handleSelectDistrict(session, sessionKey, userInput);
                break;
            case 'SELECT_SUBCOUNTY':
                response = await handleSelectSubcounty(session, sessionKey, userInput);
                break;
            case 'SELECT_STATION':
                response = await handleSelectStation(session, sessionKey, userInput);
                break;
            case 'SELECT_FUEL':
                response = await handleSelectFuel(session, sessionKey, userInput);
                break;
            case 'ENTER_PRICE':
                response = await handleEnterPrice(session, sessionKey, userInput);
                break;
            case 'CONFIRM':
                response = await handleConfirm(session, sessionKey, userInput);
                break;
            case 'VIEW_DISTRICT':
                response = await handleViewDistrict(session, sessionKey, userInput);
                break;
            case 'VIEW_STATIONS':
                response = await handleViewStations(session, sessionKey, userInput);
                break;
            default:
                response = await handleError(session, sessionKey);
        }

        // Step 6: Update session sequence number
        session.sequence += 1;
        await redis.hset(sessionKey, 'sequence', session.sequence);
        await redis.hset(sessionKey, 'last_activity', Date.now());
        await redis.expire(sessionKey, STATES[session.state]?.ttl ?? 120);

        // Step 7: Log to audit (async, non-blocking)
        kafka.produce('ussd.session.logs', {
            msisdn_hash: msisdnHash,
            session_id: sessionId,
            sequence: session.sequence,
            state: currentState,
            user_input: maskInput(currentState, userInput),
            duration_ms: Date.now() - startTime,
        });

        return response;

    } finally {
        // Release distributed lock
        await redis.eval(
            'if redis.call("get", KEYS[1]) == ARGV[1] then redis.call("del", KEYS[1]) end',
            1, lockKey, lockToken
        );
    }
}
```

## 4. State Handler Implementations

### 4.1 WELCOME Handler

```
async function handleWelcome(session, sessionKey, input) {
    const locale = session.locale;

    switch (input) {
        case '1':
            // Flow: Report Price
            session.state = 'SELECT_REGION';
            session.flow = 'report';
            await redis.hset(sessionKey, session);
            return composeResponse('CON', formatText(
                locale, 'SELECT_REGION_PROMPT',
                { regions: await getRegionList(locale) }
            ));

        case '2':
            // Flow: View Prices
            session.state = 'SELECT_REGION';
            session.flow = 'view';
            await redis.hset(sessionKey, session);
            return composeResponse('CON', formatText(
                locale, 'SELECT_REGION_PROMPT',
                { regions: await getRegionList(locale) }
            ));

        case '3':
            // Language selection
            session.state = 'WELCOME';
            await redis.hset(sessionKey, 'locale', mapLangCode(input));
            return composeResponse('CON', formatWelcome(input));

        default:
            return composeResponse('CON', formatWelcome(locale));
    }
}
```

### 4.2 SELECT_REGION Handler

```
async function handleSelectRegion(session, sessionKey, input) {
    const locale = session.locale;
    const regions = await getRegionList(locale);
    const selectionIndex = parseInt(input, 10) - 1;

    if (selectionIndex < 0 || selectionIndex >= regions.length) {
        return composeResponse('CON', formatText(locale, 'INVALID_SELECTION', {
            retry: formatText(locale, 'SELECT_REGION_PROMPT', { regions })
        }));
    }

    session.region_id = regions[selectionIndex].id;
    session.last_state = 'SELECT_REGION';
    session.state = 'SELECT_DISTRICT';
    await redis.hset(sessionKey, session);

    const districts = await getDistrictsByRegion(session.region_id, locale);
    return composeResponse('CON', formatText(locale, 'SELECT_DISTRICT_PROMPT', {
        districts
    }));
}
```

### 4.3 SELECT_STATION Handler

```
async function handleSelectStation(session, sessionKey, input) {
    const locale = session.locale;
    const stations = await getStationsBySubcounty(session.subcounty_id, locale);
    const selectionIndex = parseInt(input, 10) - 1;

    if (selectionIndex < 0 || selectionIndex >= stations.length) {
        return composeResponse('CON', formatText(locale, 'INVALID_SELECTION', {
            retry: formatText(locale, 'SELECT_STATION_PROMPT', { stations })
        }));
    }

    session.station_id = stations[selectionIndex].id;
    session.station_code = stations[selectionIndex].code;

    if (session.flow === 'view') {
        // View flow: show prices directly
        session.state = 'VIEW_STATIONS';
        await redis.hset(sessionKey, session);

        const prices = await getStationPrices(session.station_id);
        return composeResponse('END', formatText(locale, 'STATION_PRICES', {
            station: stations[selectionIndex].name,
            prices
        }));
    }

    // Report flow: ask for fuel type
    session.state = 'SELECT_FUEL';
    await redis.hset(sessionKey, session);
    return composeResponse('CON', formatText(locale, 'SELECT_FUEL_PROMPT'));
}
```

### 4.4 ENTER_PRICE Handler (with validation)

```
async function handleEnterPrice(session, sessionKey, input) {
    const locale = session.locale;
    const price = parseFloat(input.replace(/\s/g, ''));

    // Validation rules
    if (isNaN(price) || price <= 0) {
        return composeResponse('CON', formatText(locale, 'INVALID_PRICE'));
    }

    // Bounds check: price must be within reasonable range
    // (Petrol: 3000-8000 UGX, Diesel: 3000-7500 UGX, Kerosene: 2500-7000 UGX)
    const bounds = getPriceBounds(session.fuel_type);
    if (price < bounds.min || price > bounds.max) {
        return composeResponse('CON', formatText(locale, 'PRICE_OUT_OF_RANGE', {
            min: bounds.min, max: bounds.max
        }));
    }

    // Check deviation from 48h moving median
    const median = await getMovingMedian(session.station_id, session.fuel_type);
    if (median !== null) {
        const deviation = Math.abs(price - median) / median * 100;
        if (deviation > DEVIATION_THRESHOLD_PCT) {  // configurable, e.g. 25%
            // Flag for anomaly, but still allow with warning
            session.anomaly_flagged = true;
        }
    }

    session.reported_price = price;
    session.state = 'CONFIRM';
    await redis.hset(sessionKey, session);

    return composeResponse('CON', formatText(locale, 'CONFIRM_PROMPT', {
        station: session.station_code,
        fuel: session.fuel_type,
        price: price.toLocaleString(),
    }));
}
```

### 4.5 CONFIRM Handler (Submission Path)

```
async function handleConfirm(session, sessionKey, input) {
    const locale = session.locale;

    if (input !== '1') {
        // User declined — return to welcome
        session.state = 'WELCOME';
        await redis.hset(sessionKey, session);
        return composeResponse('CON', formatText(locale, 'REPORT_CANCELLED'));
    }

    // Publish price report to Kafka for async verification
    const reportPayload = {
        station_id: session.station_id,
        reporter_msisdn_hash: sessionKey.replace('session:', ''),
        fuel_type: session.fuel_type,
        reported_price: session.reported_price,
        channel: 'ussd',
        session_id: session.session_id,
        anomaly_flagged: session.anomaly_flagged || false,
        ip_address: session.ip_address,
        created_at: new Date().toISOString(),
    };

    await kafka.produce('price.reports', reportPayload);

    session.state = 'SUBMITTED';
    await redis.hset(sessionKey, session);

    return composeResponse('END', formatText(locale, 'REPORT_SUCCESS'));
}
```

## 5. View Stations (Top 3 Cheapest) Handler

```
async function handleViewStations(session, sessionKey, input) {
    const locale = session.locale;
    const topStations = await getTopCheapestStations(
        session.region_id,
        session.district_id,
        'petrol',   // or diesel
        3           // limit
    );

    if (topStations.length === 0) {
        return composeResponse('END', formatText(locale, 'NO_STATIONS_FOUND'));
    }

    // Format as ranked list with prices
    const lines = topStations.map((s, i) =>
        `${i+1}. ${s.name} — UGX ${s.price.toLocaleString()}/L`
    );

    return composeResponse('END',
        formatText(locale, 'TOP_CHEAPEST_HEADER') + '\n' +
        lines.join('\n') + '\n\n' +
        formatText(locale, 'THANK_YOU')
    );
}
```

## 6. Redis Session Maintenance

### Session Expiry & Cleanup

```
// Background worker runs every 60 seconds
async function cleanExpiredSessions() {
    const pattern = 'session:*';
    let cursor = '0';

    do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        for (const key of keys) {
            const ttl = await redis.ttl(key);
            if (ttl <= 0) {
                const sessionData = await redis.hgetall(key);
                if (sessionData && sessionData.state !== 'SUBMITTED') {
                    // Log abandoned session for analytics
                    await kafka.produce('ussd.abandoned_sessions', {
                        session_key: key,
                        last_state: sessionData.state,
                        sequence: sessionData.sequence,
                        abandoned_at: new Date().toISOString(),
                    });
                }
                await redis.del(key);
            }
        }
    } while (cursor !== '0');
}
```

### User Input Masking for PII Compliance

```
function maskInput(state, input) {
    // Mask price inputs for audit logs
    if (state === 'ENTER_PRICE' || state === 'CONFIRM') {
        return '***PRICE***';
    }
    // Menu selections (1-9) are safe to log
    return input;
}
```

## 7. Performance Budget Allocation

| Operation | Max Budget (ms) | Redis Operation | Cache Strategy |
|---|---|---|---|
| Session fetch/restore | 300 | `HGETALL` | Always hit Redis |
| Region list fetch | 400 | `SMEMBERS` or cached JSON | TTL 3600s |
| District list fetch | 400 | Cached query result | TTL 1800s |
| Station list fetch | 500 | Cached query result | TTL 300s |
| Top 3 cheapest query | 800 | PostGIS direct + Redis cache | TTL 60s |
| Price submission (Kafka) | 300 | Fire-and-forget | Async |
| 48h median fetch | 500 | Redis sorted set (ZRANGE) | Updated every 5 min |
| Response composition | 200 | N/A | In-memory |
| **Total budget** | **~3400** | | **Under 4000ms** |

## 8. GeoJSON Location Parsing for WhatsApp

```
// WhatsApp sends location as part of interactive message
// Payload structure:
// {
//   "context": { "from": "2567XXXXXXX" },
//   "message": {
//     "type": "location",
//     "location": {
//       "latitude": 0.3136,
//       "longitude": 32.5811,
//       "name": "Current Location",
//       "address": "Kampala, Uganda"
//     }
//   }
// }

function parseLocationPayload(payload) {
    const location = payload.message.location;

    return {
        type: 'Point',
        coordinates: [location.longitude, location.latitude],
        crs: { type: 'name', properties: { name: 'EPSG:4326' } }
    };
}

// Spatial query via PostGIS
async function findNearestStations(geoJsonPoint, radiusMeters = 5000) {
    const query = `
        SELECT
            s.id, s.name, s.station_code,
            fo.name AS operator,
            vp.price,
            vp.fuel_type,
            ST_AsGeoJSON(s.location) AS geometry,
            ST_Distance(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
                AS distance_meters
        FROM stations s
        JOIN fuel_operators fo ON fo.id = s.operator_id
        JOIN verified_prices vp ON vp.station_id = s.id AND vp.effective_until IS NULL
        WHERE s.is_active = TRUE
          AND ST_DWithin(s.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
        ORDER BY vp.price ASC, distance_meters ASC
        LIMIT 5
    `;

    const result = await pgPool.query(query, [
        geoJsonPoint.coordinates[0],  // lng
        geoJsonPoint.coordinates[1],  // lat
        radiusMeters
    ]);

    return result.rows;
}
```

## 9. Menu Text Templates (Localized)

All strings stored in Redis hash `i18n:{locale}:{state}` for hot-reload without deployment.

Example for Luganda:

```
i18n:lg:WELCOME -> "Matano-Meters!\n1. Teeka omuwendo\n2. Kebera\n3. Olulimi"
i18n:lg:SELECT_REGION_PROMPT -> "Londa essaza lyo:\n{regions}"
i18n:lg:SELECT_DISTRICT_PROMPT -> "Londa disitulikiti:\n{districts}"
i18n:lg:CONFIRM_PROMPT -> "Kakasa:\n{sstation}\n{fuel}\nUGX {price}/L\n1. Kakasa\n0. Ddayo"
i18n:lg:REPORT_SUCCESS -> "Webale! Omuwendo gw'efuwa gusomeseddwa. Gunaakakasibwa mu ngalo."
i18n:lg:TOP_CHEAPEST_HEADER -> "Ew'obuwanguzi esinga obusungu:"
```

---
*Document version: v1.0 — Last updated: 2026-05-29*
