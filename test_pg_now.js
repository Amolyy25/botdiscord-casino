require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function check() {
  const res = await pool.query('SELECT NOW() as pg_now');
  console.log("PostgreSQL NOW():", res.rows[0].pg_now);
  console.log("Node.js Date.now():", new Date(Date.now()).toISOString());
  process.exit(0);
}

check();
