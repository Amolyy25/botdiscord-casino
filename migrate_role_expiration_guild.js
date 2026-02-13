const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
    try {
        console.log('Adding guild_id column to role_expirations table...');
        await pool.query(`
            ALTER TABLE role_expirations 
            ADD COLUMN IF NOT EXISTS guild_id TEXT;
        `);
        console.log('✅ Migration successful: guild_id column added.');
    } catch (e) {
        console.error('❌ Migration error:', e.message);
    } finally {
        await pool.end();
    }
}

migrate();
