require('dotenv').config({ override: true });
const https = require('https');
const token = process.env.COPILOT_API_KEY;
const locId = process.env.COPILOT_LOCATION_ID;

function checkV2() {
  https.get({
    hostname: 'services.leadconnectorhq.com',
    path: `/contacts/?locationId=${locId}&limit=1`,
    headers: { 'Authorization': `Bearer ${token}`, 'Version': '2021-07-28', 'Accept': 'application/json' }
  }, res => {
    let data = ''; res.on('data', c=>data+=c); res.on('end', ()=>console.log('V2 Status:', res.statusCode, data));
  });
}

function checkV1() {
  https.get({
    hostname: 'rest.gohighlevel.com',
    path: '/v1/contacts/?limit=1',
    headers: { 'Authorization': `Bearer ${token}` }
  }, res => {
    let data = ''; res.on('data', c=>data+=c); res.on('end', ()=>console.log('V1 Status:', res.statusCode, data));
  });
}

checkV2();
checkV1();
