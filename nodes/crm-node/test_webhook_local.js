require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());
app.use('/webhooks', require('./routes/ghl_webhook'));

const server = app.listen(3100, async () => {
  try {
    const res = await fetch('http://localhost:3100/webhooks/ghl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ContactCreate',
        contact_id: 'ghl_verify_001',
        event_id: 'trejo_protocol_001',
        first_name: 'Trejo',
        last_name: 'Protocol'
      })
    });
    console.log('✅ Webhook Response Status:', res.status);
    console.log('✅ Webhook Response Body:', await res.text());
  } catch (err) {
    console.error('❌ Test Failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
