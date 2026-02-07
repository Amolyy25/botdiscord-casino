const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      balance BIGINT DEFAULT 100,
      last_daily BIGINT DEFAULT 0,
      last_vole BIGINT DEFAULT 0,
      tirages INTEGER DEFAULT 2,
      last_weekly_tirage BIGINT DEFAULT 0
    )
  `);
};

module.exports = {
  initDb,
  getUser: async (id) => {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (res.rows.length === 0) {
      const newUser = await pool.query(
        'INSERT INTO users (id, balance, tirages) VALUES ($1, $2, $3) RETURNING *',
        [id, 100, 2]
      );
      return newUser.rows[0];
    }
    return res.rows[0];
  },
  updateBalance: async (id, amount) => {
    await module.exports.getUser(id);
    const res = await pool.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance',
      [BigInt(amount), id]
    );
    return res.rows[0].balance;
  },
  setBalance: async (id, balance) => {
    await module.exports.getUser(id);
    const res = await pool.query(
      'UPDATE users SET balance = $1 WHERE id = $2 RETURNING balance',
      [BigInt(balance), id]
    );
    return res.rows[0].balance;
  },
  updateDaily: async (id, time) => {
    await module.exports.getUser(id);
    await pool.query(
      'UPDATE users SET last_daily = $1 WHERE id = $2',
      [time.toString(), id]
    );
  },
  updateVole: async (id, time) => {
    await module.exports.getUser(id);
    await pool.query(
      'UPDATE users SET last_vole = $1 WHERE id = $2',
      [time.toString(), id]
    );
  },
  updateTirages: async (id, amount) => {
    await module.exports.getUser(id);
    const res = await pool.query(
      'UPDATE users SET tirages = tirages + $1 WHERE id = $2 RETURNING tirages',
      [amount, id]
    );
    return res.rows[0].tirages;
  },
  setTirages: async (id, amount) => {
    await module.exports.getUser(id);
    const res = await pool.query(
      'UPDATE users SET tirages = $1 WHERE id = $2 RETURNING tirages',
      [amount, id]
    );
    return res.rows[0].tirages;
  },
  updateWeeklyTirage: async (id, time) => {
    await module.exports.getUser(id);
    await pool.query(
      'UPDATE users SET last_weekly_tirage = $1 WHERE id = $2',
      [time.toString(), id]
    );
  },
  getLeaderboard: async (limit = 10) => {
    const res = await pool.query(
      'SELECT id, balance FROM users ORDER BY balance DESC LIMIT $1',
      [limit]
    );
    return res.rows;
  }
};
