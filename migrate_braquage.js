require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
    try {
        console.log('Creating braquage_winners table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS braquage_winners (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                code TEXT NOT NULL,
                coins_won BIGINT DEFAULT 700,
                role_id TEXT,
                role_expires_at BIGINT,
                won_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('✅ Table braquage_winners créée avec succès !');
    } catch (e) {
        console.error('❌ Migration error:', e.message);
    } finally {
        await pool.end();
    }
}

migrate();
