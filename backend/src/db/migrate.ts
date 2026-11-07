import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SQL_PATH = path.join(__dirname, 'supabase.sql');

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set in backend/.env!');
    console.log('👉 Please set DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres in backend/.env');
    process.exit(1);
  }

  console.log('🔄 Connecting to Supabase PostgreSQL database...');

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✅ Successfully connected to Supabase PostgreSQL!');

    const sql = fs.readFileSync(SQL_PATH, 'utf-8');
    console.log('📄 Executing database schema & seed migration...');
    
    await client.query(sql);
    console.log('🎉 Supabase tables and seed data created successfully!');

    // Verify tables
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`📋 Found ${tableRes.rows.length} tables in public schema:`);
    tableRes.rows.forEach(r => console.log(`   - ${r.table_name}`));

    const productRes = await client.query(`SELECT count(*) FROM products`);
    console.log(`📦 Seed Products Count: ${productRes.rows[0].count}`);

    client.release();
    await pool.end();
    console.log('🚀 Supabase is 100% ready for deployment!');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Supabase migration failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}

runMigration();

