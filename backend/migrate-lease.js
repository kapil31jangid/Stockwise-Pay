const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:StockwisePay@1@db.fkldxvyzmmkzeqkciolh.supabase.co:5432/postgres'
});

async function migrate() {
  try {
    await pool.query(`
      ALTER TABLE capture_attempts
      ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '5 minutes'),
      ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS lease_owner VARCHAR(100),
      ADD COLUMN IF NOT EXISTS paypal_request_id VARCHAR(100);
    `);
    console.log('Columns added successfully');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_capture_attempts_lease_expires
      ON capture_attempts(lease_expires_at) WHERE status = 'CAPTURING';
    `);
    console.log('Index created successfully');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

migrate();