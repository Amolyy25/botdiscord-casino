require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function check() {
  const res = await pool.query('SELECT id, created_at, ends_at FROM giveaways ORDER BY id DESC LIMIT 5');
  for (const row of res.rows) {
    const created = new Date(row.created_at).getTime();
    const ends = parseInt(row.ends_at);
    console.log(`GW #${row.id} | created: ${new Date(created).toISOString()} | ends: ${new Date(ends).toISOString()}`);
    console.log(`  duration diff: ${(ends - created) / 60000} mins`);
  }
  process.exit(0);
}

check();
