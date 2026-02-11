require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
    try {
        console.log('Creating role_expirations table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS role_expirations (
                user_id TEXT,
                role_id TEXT,
                expires_at BIGINT,
                PRIMARY KEY (user_id, role_id)
            )
        `);
        console.log('✅ Migration successful!');
    } catch (e) {
        console.error('❌ Migration error:', e.message);
    } finally {
        await pool.end();
    }
}

migrate();
