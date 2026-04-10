const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPTS = [
    'system_hardening_calendar.js',
    'system_hardening_stripe.js',
    'system_hardening_subscriptions.js',
    'system_hardening_bridge.js'
];

const MCP_PATH = "C:\\Users\\danie\\OneDrive\\Documents\\AI_AGENTS_ANTIGRAVITY_LOCAL\\RxFit-MCP\\automation";

function log(msg) {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] PULSE: ${msg}\n`;
    console.log(entry);
    fs.appendFileSync(path.join(__dirname, 'pulse.log'), entry);
}

async function runPulse() {
    log('Initiating global semantic refresh...');
    for (const script of SCRIPTS) {
        const scriptPath = path.join(MCP_PATH, script);
        log(`Executing ${script}...`);
        try {
            await new Promise((resolve, reject) => {
                exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
                    if (error) { log(`ERROR in ${script}: ${error.message}`); return reject(error); }
                    log(`SUCCESS: ${script} execution complete.`);
                    resolve();
                });
            });
        } catch (err) { log(`CRITICAL: Pulse failed at ${script}.`); }
    }
        log('Refreshing Antigravity Brain via Python pipeline...');
    try {
        await new Promise((resolve, reject) => {
            exec('python "C:\\Users\\danie\\OneDrive\\Documents\\AI_AGENTS_ANTIGRAVITY_LOCAL\\antigravity_ingest.py"', (error, stdout, stderr) => {
                if (error) { log('ERROR in Antigravity Ingest: ' + error.message); return reject(error); }
                log('SUCCESS: Antigravity Brain refreshed.');
                resolve();
            });
        });
    } catch (err) { log('CRITICAL: Antigravity Ingest failed.'); }
    log('Global refresh complete.');
}

runPulse();
setInterval(runPulse, 4 * 60 * 60 * 1000);
log('Pulse Engine active and monitoring nodes...');



