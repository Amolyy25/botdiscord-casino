require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
    try {
        console.log('Adding last_boost column...');
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_boost BIGINT DEFAULT 0');
        console.log('✅ Migration successful!');
    } catch (e) {
        console.error('❌ Migration error:', e.message);
    } finally {
        await pool.end();
    }
}

migrate();
