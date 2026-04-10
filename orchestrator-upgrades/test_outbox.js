const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/antigravity_brain' });

const testInsert = `
INSERT INTO outbox_commands (topic, payload, attributes) 
VALUES (
    'jade-commands', 
    '{"commandId": "test-uuid-123", "command": "ECHO test", "sourceEvent": "TREJO_AUDIT_01"}',
    '{"test": "true"}'
)
RETURNING id;
`;

pool.query(testInsert)
  .then(res => {
      console.log('✅ Mock outbox command inserted. ID:', res.rows[0].id);
      pool.end();
  })
  .catch(err => {
      console.error('❌ Insert failed:', err.message);
      pool.end();
  });
