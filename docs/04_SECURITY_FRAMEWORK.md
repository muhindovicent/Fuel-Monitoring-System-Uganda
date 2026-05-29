# MafutaWatch Uganda — Security Framework: Sybil Attack Mitigation Protocol

## 1. Threat Model Overview

### 1.1 Attack Surface

```
┌──────────────────────────────────────────────────────────────────┐
│                    ATTACK SURFACE MAP                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  USSD Channel (*284*X#)                                          │
│  ├─ Spoofed MSISDN (SS7/IMS catcher)                             │
│  ├─ Automated dialing bots (SIM farms)                           │
│  └─ Bulk price flooding via GSM modem arrays                     │
│                                                                   │
│  WhatsApp Bot Channel                                             │
│  ├─ Virtual phone number farms (Twilio/TextNow/VoIP)             │
│  ├─ Automated WhatsApp Web botnets                               │
│  └─ Location spoofing (GPS faking)                               │
│                                                                   │
│  PWA / API Channel                                                │
│  ├─ Credential stuffing + bot-driven API abuse                   │
│  ├─ Residential proxy rotation (Luminati/911)                    │
│  └─ Headless browser automation (Puppeteer/Playwright)           │
│                                                                   │
│  PRIMARY ATTACK GOALS:                                            │
│  1. Depot-price manipulation (artificially crash or inflate)     │
│  2. Convoy rerouting (by showing false cheap prices)             │
│  3. Competitive sabotage (undercut rival stations in reports)    │
│  4. Extortion (flood bad reports, demand payment to correct)     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Adversary Profiles

| Profile | Resources | Capability | Volume |
|---|---|---|---|
| Individual rider (opportunistic) | 1 SIM, 1 phone | Low | ~10 reports/day |
| Boda stage (coordinated) | 5-20 SIMs, group chat | Medium | ~100 reports/day |
| SIM farm operator (commercial) | 100-1000 SIMs, GSM banks | High | ~5,000 reports/day |
| Competitor station (malicious) | 50-200 SIMs, proxy network | High | ~2,000 reports/day |
| Nation-state / organized crime | Unlimited | Very High | 10,000+ reports/day |

## 2. Defense-in-Depth Architecture

```
LAYER 1: ACCESS CONTROL
    ┌─────────────────────────────────┐
    │  MSISDN Rate Limiting           │
    │  IP Reputation Scoring          │
    │  Device Fingerprinting (PWA)    │
    │  CAPTCHA / Proof-of-Work (USSD) │
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
LAYER 5: MANUAL REVIEW & INCIDENT RESPONSE
    ┌─────────────────────────────────┐
    │  Anomaly Alert Queue            │
    │  Price Freeze Mechanism         │
    │  Station Whitelist/Blacklist    │
    │  Law Enforcement Escalation     │
    └─────────────────────────────────┘
```

## 3. Layer 1 — Access Control Mitigations

### 3.1 MSISDN Rate Limiting (Strict)

```
// Rate limit configuration per endpoint
const RATE_LIMITS = {
    'price.submit': {
        window_ms: 3600000,           // 1 hour sliding window
        max_requests: 5,             // Max 5 price submissions per hour
        burst: 2,                    // Max 2 per 10 minutes
        consequence: 'block_24h',    // Block for 24 hours on exceed
    },
    'ussd.dial': {
        window_ms: 60000,            // 1 minute
        max_requests: 10,            // Max 10 USSD dials per minute
        consequence: 'block_1h',
    },
    'station.view': {
        window_ms: 60000,
        max_requests: 30,
        consequence: 'throttle_10s',
    },
    'auth.otp': {
        window_ms: 900000,           // 15 minutes
        max_requests: 3,             // Max 3 OTP attempts
        consequence: 'block_perm',   // Permanent block on abuse
    },
};

// Implementation: Sliding window counter in Redis
async function checkRateLimit(msisdnHash, endpoint) {
    const config = RATE_LIMITS[endpoint];
    if (!config) return { allowed: true };

    const now = Date.now();
    const windowKey = `ratelimit:${msisdnHash}:${endpoint}:${Math.floor(now / config.window_ms)}`;

    const currentCount = await redis.incr(windowKey);
    if (currentCount === 1) {
        await redis.pexpire(windowKey, config.window_ms);
    }

    if (currentCount > config.max_requests) {
        // Log the rate limit event
        await logRateLimitEvent(msisdnHash, endpoint, currentCount);

        // Apply escalating consequences
        const blockDuration = getBlockDuration(msisdnHash, endpoint, currentCount);
        await redis.set(
            `blocked:${msisdnHash}:${endpoint}`,
            'true',
            'EX', blockDuration
        );

        return { allowed: false, reason: 'RATE_LIMITED', blockDuration };
    }

    return { allowed: true };
}

// Escalating block duration based on repeat offenses
function getBlockDuration(msisdnHash, endpoint, currentCount) {
    const offenseKey = `offense:${msisdnHash}:${endpoint}`;
    const offenseCount = await redis.incr(offenseKey);
    await redis.expire(offenseKey, 86400 * 30);  // 30 day expiry for offense count

    switch (offenseCount) {
        case 1: return 3600;          // 1 hour
        case 2: return 86400;         // 24 hours
        case 3: return 604800;        // 7 days
        default: return 2592000;      // 30 days (permanent-ish)
    }
}
```

### 3.2 IP Reputation Scoring

```
// Reputation scoring for API endpoints
// Integrated with the API Gateway (Kong plugin)

function scoreIPReputation(ipAddress) {
    const checks = await Promise.all([
        checkKnownProxyList(ipAddress),     // Known VPN/Tor exit nodes
        checkResidentialProxy(ipAddress),    // Residential proxy ASNs
        checkASNCarrierMatch(ipAddress),     // Matches MTN/Airtel Uganda ASNs?
        checkHistoricalFraud(ipAddress),     // Previous abuse from this IP
        checkGeoVelocity(ipAddress),         // Unusual geographic traversal
    ]);

    // Score: 0 (clean) to 100 (certain abuse)
    const score = checks.reduce((sum, c) => sum + c.weight, 0);

    if (score > 80) {
        // Block outright — likely a proxy or known abuser
        return { action: 'block', reason: 'HIGH_RISK_IP' };
    } else if (score > 50) {
        // Challenge — require additional verification
        return { action: 'challenge', reason: 'SUSPICIOUS_IP' };
    } else if (score > 20) {
        // Tag — monitor but allow; reduce trust weight
        return { action: 'tag', reason: 'LOW_REPUTATION' };
    }

    return { action: 'allow' };
}

// Carrier ASN whitelist (Ugandan mobile operators)
const UGANDA_CARRIER_ASNS = [
    'AS36936',   // MTN Uganda
    'AS36935',   // Airtel Uganda
    'AS37277',   // Uganda Telecom (UTL)
    'AS328167',  // Lycamobile Uganda
    'AS37323',   // Africell Uganda (if operational)
    'AS328222',  // Roke Telkom
];
```

### 3.3 USSD Proof-of-Work Challenge

```
// USSD Challenge-Response: Simple arithmetic gate
// No CAPTCHA possible on USSD — use cognitive challenges

const CHALLENGES = {
    en: [
        { q: "What is 12 + 7?", a: "19" },
        { q: "What is 25 - 9?", a: "16" },
        { q: "How many wheels on 3 bodas?", a: "6" },
        { q: "What is half of 50?", a: "25" },
    ],
    lg: [
        { q: "12 + 7 = ?", a: "19" },
        { q: "25 - 9 = ?", a: "16" },
        { q: "Boda bbiri zina magudugudu meka?", a: "6" },  // "How many wheels on 2 bodas?"
    ],
};

async function shouldChallengeUser(msisdnHash, session) {
    // Challenge only when suspicious patterns detected
    const reportsLastHour = await redis.get(`count:${msisdnHash}:1h`) || 0;
    const trustScore = session.trust_score || 0;

    // No challenge for trusted users
    if (trustScore >= 50) return false;

    // Challenge if submitting rapidly
    if (reportsLastHour >= 3) return true;

    // Random challenge for new users (10% probability)
    if (trustScore < 20 && Math.random() < 0.1) return true;

    return false;
}

async function issueChallenge(msisdnHash, locale) {
    const challenges = CHALLENGES[locale] || CHALLENGES.en;
    const challenge = challenges[Math.floor(Math.random() * challenges.length)];

    // Store expected answer in Redis (single-use, TTL 120s)
    await redis.setex(`challenge:${msisdnHash}`, 120, challenge.a);

    return composeResponse('CON',
        '🛡️ Verification\n' + challenge.q + '\n\n0. Back'
    );
}

async function verifyChallenge(msisdnHash, userAnswer) {
    const expected = await redis.get(`challenge:${msisdnHash}`);
    if (!expected) return false;
    await redis.del(`challenge:${msisdnHash}`);
    return userAnswer.trim() === expected;
}
```

## 4. Layer 2 — Trust & Reputation System

### 4.1 Trust Score Algorithm

```
// Trust score: 0 (malicious) → 100 (highly trusted)
// Initial: 0 (unverified)
// Max daily gain: +6 (prevents rapid trust accumulation)

function calculateTrustDelta(reportOutcome, context) {
    let delta = 0;

    switch (reportOutcome) {
        case 'verified_match':
            // Report matched consensus — positive signal
            delta = +2;
            if (context.consecutive_verified >= 5) delta += 1;
            if (context.consecutive_verified >= 20) delta += 1;
            break;

        case 'consensus_contributed':
            // Voted in consensus group, matched majority
            delta = +1;
            break;

        case 'verified_first_mover':
            // First reporter, later confirmed — higher trust
            delta = +3;
            break;

        case 'rejected_outlier':
            // Reported price far from median — negative
            delta = -5;
            break;

        case 'rejected_duplicate':
            // Same price already reported — warning
            delta = -1;
            break;

        case 'consensus_expired':
            // Started consensus but never confirmed
            delta = -2;
            break;

        case 'sybil_flagged':
            // Flagged by anomaly detection engine
            delta = -25;
            break;

        case 'rate_limited':
            // Repeated rate limit violations
            delta = -10;
            break;
    }

    // Apply daily cap on positive gains
    const dailyGain = await getDailyTrustGain(userId);
    if (delta > 0 && dailyGain + delta > MAX_DAILY_GAIN) {
        delta = Math.max(0, MAX_DAILY_GAIN - dailyGain);
    }

    return delta;
}

// Tier thresholds and authority levels
const TIER_CONFIG = {
    unverified:        { minScore: 0,  consensusRequired: 3, canReportDirect: false },
    basic:             { minScore: 20, consensusRequired: 3, canReportDirect: false },
    trusted:           { minScore: 50, consensusRequired: 0, canReportDirect: true  },
    verified_reporter: { minScore: 80, consensusRequired: 0, canReportDirect: true  },
    station_official:  { minScore: 95, consensusRequired: 0, canReportDirect: true  },
    association_leader:{ minScore: 100,consensusRequired: 0, canReportDirect: true  },
};
```

### 4.2 Consensus-Based Verification Pipeline

```
// ============================================================================
// CONSENSUS ENGINE
// ============================================================================
// For low-trust reporters (< 50), a price update requires 3 matching reports
// from independent users within a 15-minute window.

async function processPriceReport(report) {
    // Step 1: Get reporter's trust score
    const user = await getUser(report.reporter_user_id);
    const tierConfig = TIER_CONFIG[user.tier];

    // Step 2: High-trust users — fast path
    if (tierConfig.canReportDirect) {
        const verificationResult = await verifyAgainstMedian(report);
        if (verificationResult.passed) {
            await publishVerifiedPrice(report);
            await updateTrustScore(user.id, 'verified_first_mover');
            return { status: 'verified', method: 'high_trust_direct' };
        } else {
            // Even high-trust users can be rejected if deviation is extreme
            await updateTrustScore(user.id, 'rejected_outlier');
            return { status: 'rejected', reason: 'extreme_deviation' };
        }
    }

    // Step 3: Low-trust users — consensus path
    const existingGroup = await findOpenConsensusGroup(
        report.station_id,
        report.fuel_type
    );

    if (existingGroup) {
        // Join existing consensus group
        const match = await addVoteToGroup(existingGroup.id, report);

        if (existingGroup.current_votes + 1 >= existingGroup.min_required_votes) {
            // Consensus achieved! All votes within acceptable range
            const medianPrice = calculateGroupMedian(existingGroup.id);
            await publishVerifiedPrice({
                ...report,
                reported_price: medianPrice,
            });
            await resolveConsensusGroup(existingGroup.id, medianPrice);
            await updateTrustScore(report.reporter_user_id, 'verified_match');
            return { status: 'verified', method: 'consensus_achieved', price: medianPrice };
        }

        return { status: 'pending', method: 'consensus_waiting', group_id: existingGroup.id };
    }

    // Step 4: Create new consensus group
    const group = await createConsensusGroup(report);
    return { status: 'pending', method: 'consensus_initiated', group_id: group.id };
}

// Consensus group TTL: 15 minutes
async function createConsensusGroup(report) {
    const median = await getMovingMedian(report.station_id, report.fuel_type);
    const acceptableRange = [
        Math.round(median * (1 - CONSENSUS_RANGE_PCT / 100)),
        Math.round(median * (1 + CONSENSUS_RANGE_PCT / 100)),
    ];

    const group = await db.consensus_groups.create({
        station_id: report.station_id,
        fuel_type: report.fuel_type,
        target_price_range: acceptableRange,
        min_required_votes: 3,
        expires_at: Date.now() + 15 * 60 * 1000,  // 15 minutes
    });

    // Add the initiating vote
    await db.consensus_votes.create({
        consensus_group_id: group.id,
        reporter_user_id: report.reporter_user_id,
        reported_price: report.reported_price,
    });

    return group;
}
```

### 4.3 Sybil-Resistant Device Fingerprinting (PWA Channel)

```
// Browser fingerprint dimensions collected via PWA

interface DeviceFingerprint {
    // Passive signals (no permission required)
    userAgent: string;              // UA string + header order
    screenResolution: string;       // "1920x1080x24"
    colorDepth: number;             // 24 or 30
    timezone: string;               // "Africa/Kampala"
    language: string;               // "en-UG", "lg-UG"
    platform: string;               // "Win32", "Linux armv8l"
    hardwareConcurrency: number;    // navigator.hardwareConcurrency
    deviceMemory: number;           // navigator.deviceMemory (GB)
    cpuClass: string;               // navigator.cpuClass (IE/Edge legacy)
    canvasFingerprint: string;      // Canvas 2D hash
    webglFingerprint: string;       // WebGL renderer hash
    fontsFingerprint: string[];     // Installed fonts (flash + CSS)
    audioFingerprint: string;       // AudioContext dynamics fingerprint
    batteryInfo: object;            // { charging, level, chargingTime }

    // Active signals (requires permission)
    deviceOrientation?: object;     // DeviceOrientationEvent
    geolocation?: object;           // Precise location (if shared)
    bluetoothDevices?: string[];    // Paired BT devices (if permission)
}

// Fingerprint similarity scoring (for Sybil cluster detection)
function calculateFingerprintSimilarity(fp1, fp2): number {
    const weights = {
        canvasFingerprint: 0.30,     // High entropy, unique per device
        webglFingerprint: 0.25,      // Very high entropy (GPU-specific)
        fontsFingerprint: 0.15,      // Medium entropy
        audioFingerprint: 0.10,      // Medium entropy
        hardwareConcurrency: 0.05,   // Low entropy but stable
        screenResolution: 0.05,      // Medium entropy
        platform: 0.05,              // Low entropy
        language: 0.03,              // Low entropy
        timezone: 0.02,              // Very low (stable)
    };

    let similarity = 0;
    for (const [dimension, weight] of Object.entries(weights)) {
        if (fp1[dimension] === fp2[dimension]) {
            similarity += weight;
        }
    }

    return similarity;  // 0.0 (different devices) to 1.0 (same device)
}

// Cluster detection: If > 5 users share > 80% fingerprint similarity,
// flag as potential SIM farm / botnet
```

## 5. Layer 3 — Statistical Verification Engine

### 5.1 Moving Median Anti-Cheat Algorithm

```
// ============================================================================
// MOVING MEDIAN ANTI-CHEAT
// ============================================================================
// Computes a rolling 48-hour median price per (station, fuel_type).
// Uses Redis sorted sets for O(log N) window queries.

const MEDIAN_WINDOW_HOURS = 48;
const MAX_DEVIATION_PCT = 25;  // Reject if price deviates > 25% from median
const WARN_DEVIATION_PCT = 15; // Flag for review if > 15%

async function computeMovingMedian(stationId, fuelType) {
    const cacheKey = `median:${stationId}:${fuelType}:48h`;

    // Check cache first (recomputed every 5 minutes)
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const cutoff = new Date(Date.now() - MEDIAN_WINDOW_HOURS * 3600000);

    const result = await db.query(`
        SELECT
            percentile_cont(0.5) WITHIN GROUP (ORDER BY reported_price) AS median,
            percentile_cont(0.25) WITHIN GROUP (ORDER BY reported_price) AS q1,
            percentile_cont(0.75) WITHIN GROUP (ORDER BY reported_price) AS q3,
            AVG(reported_price) AS mean,
            stddev(reported_price) AS stddev,
            COUNT(*) AS sample_count
        FROM price_reports
        WHERE station_id = $1
          AND fuel_type = $2
          AND created_at >= $3
          AND status IN ('verified', 'pending')
    `, [stationId, fuelType, cutoff]);

    const stats = result.rows[0];

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(stats));

    return stats;
}

// Deviation check
async function verifyPriceAgainstMedian(report) {
    const stats = await computeMovingMedian(report.station_id, report.fuel_type);

    if (!stats || stats.sample_count < 5) {
        // Insufficient baseline — allow but flag for review
        return {
            passed: true,
            confidence: 'low',
            reason: 'insufficient_baseline',
            deviation_pct: 0,
        };
    }

    const deviation = Math.abs(report.reported_price - stats.median) / stats.median * 100;

    if (deviation > MAX_DEVIATION_PCT) {
        return {
            passed: false,
            confidence: 'high',
            reason: 'extreme_deviation',
            deviation_pct: deviation,
            median: stats.median,
            q1: stats.q1,
            q3: stats.q3,
        };
    }

    if (deviation > WARN_DEVIATION_PCT) {
        return {
            passed: true,
            confidence: 'medium',
            reason: 'moderate_deviation',
            deviation_pct: deviation,
            median: stats.median,
            flagged: true,
        };
    }

    return {
        passed: true,
        confidence: 'high',
        reason: 'within_normal_range',
        deviation_pct: deviation,
        median: stats.median,
    };
}
```

### 5.2 Time-Series Anomaly Detection

```
// Detect sudden price spikes / drops using Z-score on recent window

async function detectPriceAnomaly(stationId, fuelType) {
    const recentPrices = await db.query(`
        SELECT reported_price, created_at
        FROM price_reports
        WHERE station_id = $1
          AND fuel_type = $2
          AND created_at >= NOW() - INTERVAL '6 hours'
          AND status = 'verified'
        ORDER BY created_at DESC
    `, [stationId, fuelType]);

    if (recentPrices.rows.length < 3) return null;

    const prices = recentPrices.rows.map(r => parseFloat(r.reported_price));
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
    const stddev = Math.sqrt(variance);

    const latest = prices[0];
    const zScore = Math.abs(latest - mean) / (stddev || 1);

    if (zScore > 3.0) {
        // Z-score > 3 = statistically significant anomaly (p < 0.003)
        await db.anomaly_alerts.create({
            alert_type: zScore > 0 ? 'price_spike' : 'price_drop',
            severity: zScore > 4 ? 'critical' : 'warning',
            station_id: stationId,
            fuel_type: fuelType,
            reported_price: latest,
            median_baseline: mean,
            deviation_pct: Math.abs(latest - mean) / mean * 100,
            detection_metadata: { z_score: zScore, sample_size: prices.length },
        });

        return { anomaly: true, zScore, severity: zScore > 4 ? 'critical' : 'warning' };
    }

    return { anomaly: false, zScore };
}
```

## 6. Layer 4 — Behavioral Detection

### 6.1 Inter-arrival Time Analysis

```
// Detect automated submission patterns by analyzing time gaps
// between consecutive reports from the same user.

async function analyzeSubmissionPattern(msisdnHash) {
    const recentTimestamps = await redis.lrange(
        `timestamps:${msisdnHash}`, 0, 49
    );

    if (recentTimestamps.length < 10) return null;

    const intervals = [];
    for (let i = 1; i < recentTimestamps.length; i++) {
        intervals.push(recentTimestamps[i-1] - recentTimestamps[i]);
    }

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const stddev = Math.sqrt(
        intervals.reduce((sum, i) => sum + Math.pow(i - mean, 2), 0) / intervals.length
    );
    const cv = stddev / mean;  // Coefficient of variation

    // Human behavior has high CV (>= 0.5)
    // Bot behavior has low CV (< 0.2) — regular intervals
    if (cv < 0.2 && mean < 30000) {
        // Suspicious: very regular timing, < 30 seconds apart
        return {
            pattern: 'automated',
            confidence: cv < 0.1 ? 'high' : 'medium',
            coefficient_variation: cv,
            mean_interval_ms: mean,
        };
    }

    return {
        pattern: 'human_like',
        coefficient_variation: cv,
        mean_interval_ms: mean,
    };
}
```

### 6.2 Geospatial Sybil Cluster Detection

```
// Detect multiple reports originating from the same geographic
// cluster (SIM farm physical location).

async function detectGeospatialSybil(windowMinutes = 60) {
    const clusters = await db.query(`
        SELECT
            ST_ClusterDBSCAN(location_lat || ',' || location_lng, 0.001, 5)
                OVER () AS cluster_id,
            COUNT(*) AS report_count,
            COUNT(DISTINCT reporter_user_id) AS unique_reporters,
            ARRAY_AGG(DISTINCT reporter_user_id) AS reporter_ids
        FROM price_reports
        WHERE created_at >= NOW() - ($1 || ' minutes')::INTERVAL
          AND location_lat IS NOT NULL
          AND location_lng IS NOT NULL
        GROUP BY cluster_id
        HAVING COUNT(DISTINCT reporter_user_id) >= 5
           AND COUNT(*) >= 10
    `, [windowMinutes]);

    for (const cluster of clusters.rows) {
        // Check if all reporters are low-trust
        const trustScores = await getTrustScores(cluster.reporter_ids);
        const avgTrust = trustScores.reduce((a, b) => a + b, 0) / trustScores.length;

        if (avgTrust < 20 && cluster.report_count > 20) {
            // Likely SIM farm operation
            await escalateSybilAlert({
                type: 'geo_cluster_sybil',
                cluster_id: cluster.cluster_id,
                reporter_ids: cluster.reporter_ids,
                report_count: cluster.report_count,
                avg_trust_score: avgTrust,
            });

            // Auto-blacklist all involved reporters
            for (const userId of cluster.reporter_ids) {
                await blacklistUser(userId, 'sybil_geo_cluster');
            }
        }
    }
}
```

### 6.3 Session Fingerprinting (USSD)

```
// USSD sessions carry subtle telco metadata that can fingerprint
// the device/network path:

interface USSDMetadata {
    msisdn: string;             // Provided by Africa's Talking
    sessionId: string;          // Per-session unique ID
    networkCode: string;        // "MTNUG" | "AIRTLUG" | ...
    serviceCode: string;        // "*284#"
    inputSequence: number;      // Sequential menu navigation number

    // Derived fingerprints:
    msisdnTenure: number;       // How long since first seen (days)
    deviceNetworkType?: string; // "4G", "3G", "2G" (from telco)
    cellId?: string;            // Approximate tower location
    roamingStatus?: boolean;    // Is MSISDN roaming?
}

// Detect SIM swaps: same user_id, different MSISDN prefix
async function detectSIMSwap(userId, currentMsisdnHash) {
    const previousHashes = await db.query(`
        SELECT DISTINCT msisdn_hash
        FROM ussd_session_logs
        WHERE reporter_user_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
    `, [userId]);

    for (const prev of previousHashes.rows) {
        if (prev.msisdn_hash !== currentMsisdnHash) {
            // SIM swap detected — freeze trust and require re-verification
            await db.users.update({
                trust_score: Math.min(trustScore, 10),  // Cap at 10
                tier: 'unverified',
                reason: 'sim_swap_detected',
            });
            return { simSwap: true, previousHash: prev.msisdn_hash };
        }
    }
    return { simSwap: false };
}
```

## 7. Incident Response Protocol

### 7.1 Alert Severity Matrix

| Severity | Example | Response Time | Action |
|---|---|---|---|
| **Info** | Single modest deviation (15-25%) | Next business day | Log + monitor |
| **Warning** | Moderate deviation cluster | 1 hour | Flag stations, alert team |
| **Critical** | Active price manipulation attack | 15 minutes | Price freeze, auto-rollback, law enforcement |

### 7.2 Price Freeze Mechanism

```
// Emergency trigger: when a verified station's price changes more than
// 2 standard deviations within 1 hour, or when > 50 reports from
// blacklisted sources target a single station.

async function emergencyPriceFreeze(stationId, reason) {
    const station = await db.stations.findById(stationId);

    // Lock all price updates for this station
    await db.verified_prices.update({
        station_id: stationId,
        effective_until: NOW(),
    }, {
        where: { effective_until: null },
    });

    // Create frozen price entry
    await db.verified_prices.create({
        station_id: stationId,
        fuel_type: 'petrol',
        price: station.last_known_price,
        source_report_id: null,
        verified_by_user_id: null,
        verification_method: 'emergency_freeze',
        effective_from: NOW(),
        effective_until: NOW() + INTERVAL '24 hours',
    });

    // Notify station operator
    await notifyStationOperator(station.operator_id, {
        type: 'price_freeze',
        station_id: stationId,
        reason: reason,
        frozen_price: station.last_known_price,
        freeze_duration: '24 hours',
    });

    // Create incident record
    await db.incident_logs.create({
        type: 'price_freeze',
        severity: 'critical',
        station_id: stationId,
        metadata: { reason, triggered_at: NOW() },
    });

    // Invalidate all caches for this station
    await invalidateStationCache(stationId);

    return { frozen: true, price: station.last_known_price };
}
```

### 7.3 Integration with Uganda Data Protection & Privacy Act

```
// ============================================================================
// DATA PROTECTION COMPLIANCE
// ============================================================================

// 1. MSISDN HASHING (Section 14: Data minimization)
//    - Salted SHA-256, per-user random salt
//    - Salt stored separately from hash
//    - Raw MSISDN never persisted beyond registration staging (24h purge)

// 2. DATA RETENTION (Section 19: Storage limitation)
//    - Price reports: 12 months active, archived after
//    - USSD session logs: 6 months
//    - Registration staging: 24 hours
//    - Audit logs: 3 years (legal requirement)

// 3. CONSENT MANAGEMENT (Section 8: Consent)
//    - User must consent to data collection on first USSD dial
//    - Consent recorded in users table
//    - Right to withdraw: user can text *284*0# to opt out

// 4. DATA ACCESS RIGHTS (Section 15: Right of access)
//    - API endpoint: GET /api/v1/user/data
//    - Returns all personal data held in machine-readable format
//    - Response time: within 30 days (per Act)

// 5. BREACH NOTIFICATION (Section 21: Security breach)
//    - Automated alert to DPO within 24 hours
//    - Notification to affected users within 48 hours
//    - Notification to NITA-U / Personal Data Protection Office
```

## 8. Security Configuration Reference

### 8.1 Parameters (Tunable)

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
| `RATE_LIMIT_BURST` | 2 | Burst allowance within rate limit window |
| `BLOCK_DURATION_ESCALATION` | 1h/24h/7d/30d | Progressive block durations |
| `SYBIL_CLUSTER_MIN_USERS` | 5 | Minimum users to trigger geo cluster alert |
| `SYBIL_CLUSTER_MIN_REPORTS` | 10 | Minimum reports to trigger geo cluster alert |
| `ANOMALY_ZSCORE_THRESHOLD` | 3.0 | Z-score above which triggers anomaly alert |
| `LOW_TRUST_THRESHOLD` | 20 | Score below which all reports require consensus |
| `HIGH_TRUST_THRESHOLD` | 50 | Score above which direct reporting is allowed |

### 8.2 Monitoring Dashboards (Grafana)

| Dashboard | Key Metrics | Alert Threshold |
|---|---|---|
| **Rate Limiting** | Blocked requests/min, Top blocked MSISDNs | > 100/min |
| **Trust Distribution** | Avg trust score, Tier distribution | > 10% unverified submitting |
| **Consensus Pipeline** | Open groups, Avg resolution time | > 30 min average |
| **Price Anomalies** | Spike/drop events, Affected stations | > 5 critical/hr |
| **Sybil Detection** | Geo clusters, Fingerprint collisions | > 1 cluster detected |
| **Verification Lag** | Kafka consumer lag (by partition) | > 10,000 messages |

---
*Document version: v1.0 — Last updated: 2026-05-29*
