/**
 * routes/sales-velocity.js — Sales Velocity API for Command Center.
 *
 * Exposes the SEO→M.R. Agent pipeline data as a JSON endpoint
 * so the Command Center (and any other consumer) can fetch
 * neighborhood priorities, persona boosts, and demand signals.
 *
 * Reads directly from the seo-intel-snapshot.json produced by
 * the SEO Agent, cross-referenced with the M.R. Agent config.
 *
 * Wolverine Clause: If snapshot is missing, returns partial data
 * with degraded flags. Never crashes, never blocks CRM boot.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Snapshot path — SEO Agent writes to M.R. Agent's data dir
const SNAPSHOT_PATH = path.join(
    __dirname, '..', '..', '..', '..',
    'RxFit-MCP', 'automation', 'mr-agent', 'data', 'seo-intel-snapshot.json'
);

// Golden Zipcodes — loaded from shared authority file (single source of truth)
let NEIGHBORHOODS;
try {
    const goldenPath = path.join(
        __dirname, '..', '..', '..', '..',
        'RxFit-MCP', 'automation', 'shared', 'golden-zipcodes.json'
    );
    NEIGHBORHOODS = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    console.log(`[SALES-VELOCITY] Loaded ${NEIGHBORHOODS.length} neighborhoods from golden-zipcodes.json`);
} catch (_) {
    // Wolverine fallback — inline copy if shared file unreachable
    console.warn('[SALES-VELOCITY] Golden zipcodes not found — using inline fallback');
    NEIGHBORHOODS = [
        { name: 'Tarrytown', zip: '78703' },
        { name: 'Barton Creek', zip: '78735' },
        { name: 'Downtown Austin', zip: '78701' },
        { name: 'Rollingwood', zip: '78746' },
        { name: 'West Lake Hills', zip: '78746' },
        { name: 'Rob Roy', zip: '78746' },
        { name: 'South Austin / SoCo', zip: '78704' },
        { name: 'Northwest Hills', zip: '78731' },
        { name: 'Hyde Park', zip: '78705' },
        { name: 'East Austin', zip: '78722' },
        { name: 'Windsor Park / Mueller', zip: '78723' },
        { name: 'Northwest Austin', zip: '78759' },
    ];
}

function loadSnapshot() {
    try {
        if (!fs.existsSync(SNAPSHOT_PATH)) return null;
        return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    } catch (err) {
        console.error(`[SALES-VELOCITY] Failed to load snapshot: ${err.message}`);
        return null;
    }
}

function computePriorities(snapshot) {
    const priorities = {};
    if (!snapshot?.neighborhoodDominance) return priorities;

    for (const [hood, data] of Object.entries(snapshot.neighborhoodDominance)) {
        const vis = data.visibilityScore || 0;
        const revenue = snapshot.revenueSignals?.[hood];
        const hasConv = revenue && !revenue.isLeakyBucket && revenue.revenueImpactScore > 0;
        const isLeaky = revenue?.isLeakyBucket;

        let mult;
        if (vis >= 80 && hasConv) mult = 2.0;
        else if (vis >= 60 && hasConv) mult = 1.6;
        else if (vis >= 40) mult = 1.2;
        else if (vis > 0) mult = 0.9;
        else if (isLeaky) mult = 0.6;
        else mult = 1.0;

        priorities[hood] = { multiplier: mult, visibilityScore: vis, hasConversions: hasConv, isLeaky: isLeaky || false };
    }
    return priorities;
}

/**
 * SDM Internal Key auth guard — prevents unauthenticated access
 * to competitive intelligence endpoints.
 */
function requireSdmKey(req, res, next) {
    const key = req.headers['x-sdm-internal-key'];
    const expected = process.env.SDM_INTERNAL_KEY;
    if (!expected || key !== expected) {
        return res.status(401).json({ error: 'Unauthorized — SDM key required' });
    }
    next();
}

/**
 * Mount sales-velocity routes onto the Express app.
 * @param {import('express').Express} app
 */
function mount(app) {
    // GET /sales-velocity — Full pipeline snapshot for Oscar's Command Center
    app.get('/sales-velocity', requireSdmKey, (req, res) => {
        try {
            const snapshot = loadSnapshot();
            const degraded = [];

            if (!snapshot) {
                degraded.push('seo_snapshot_missing');
            } else if (snapshot._meta?.degraded) {
                degraded.push(...snapshot._meta.degraded);
            }

            const priorities = snapshot ? computePriorities(snapshot) : {};

            const neighborhoods = NEIGHBORHOODS.map(hood => ({
                ...hood,
                seoVisibility: priorities[hood.name]?.visibilityScore || 0,
                seoMultiplier: priorities[hood.name]?.multiplier || 1.0,
                hasConversions: priorities[hood.name]?.hasConversions || false,
                isLeaky: priorities[hood.name]?.isLeaky || false,
            }));

            res.json({
                status: 'ok',
                generatedAt: snapshot?._meta?.generatedAt || null,
                servedAt: new Date().toISOString(),
                degraded,
                neighborhoods,
                authorityMetrics: snapshot?.authorityMetrics || null,
                keywordIntentSignals: snapshot?.keywordIntentSignals || null,
                demandSignals: (snapshot?.demandSignals || []).slice(0, 15),
            });
        } catch (err) {
            console.error(`[SALES-VELOCITY] Error: ${err.message}`);
            res.status(500).json({ status: 'error', error: err.message });
        }
    });

    // GET /sales-velocity/summary — Lightweight summary for dashboard widgets
    app.get('/sales-velocity/summary', requireSdmKey, (req, res) => {
        try {
            const snapshot = loadSnapshot();
            const priorities = snapshot ? computePriorities(snapshot) : {};

            const topHoods = Object.entries(priorities)
                .sort((a, b) => b[1].multiplier - a[1].multiplier)
                .slice(0, 5)
                .map(([name, data]) => ({ name, ...data }));

            const degraded = [];
            if (!snapshot) degraded.push('seo_snapshot_missing');
            else if (snapshot._meta?.degraded) degraded.push(...snapshot._meta.degraded);

            res.json({
                status: 'ok',
                snapshotAge: snapshot?._meta?.generatedAt
                    ? Math.round((Date.now() - new Date(snapshot._meta.generatedAt).getTime()) / (1000 * 60 * 60))
                    : null,
                degraded,
                topNeighborhoods: topHoods,
                totalBacklinks: snapshot?.authorityMetrics?.totalBacklinks || 0,
                highIntentQueries: (snapshot?.demandSignals || [])
                    .filter(q => /trainer|coach|training|fitness|personal/i.test(q.query || q.keys?.[0]))
                    .length,
            });
        } catch (err) {
            res.status(500).json({ status: 'error', error: err.message });
        }
    });

    console.log('[CRM-NODE] Sales Velocity routes mounted: /sales-velocity, /sales-velocity/summary');
}

module.exports = { mount };
