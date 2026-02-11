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
      last_weekly_tirage BIGINT DEFAULT 0,
      last_boost BIGINT DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS bounties (
      id SERIAL PRIMARY KEY,
      message_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      reward BIGINT NOT NULL,
      author_id TEXT NOT NULL,
      winner_id TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS role_expirations (
      user_id TEXT,
      role_id TEXT,
      expires_at BIGINT,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS braquage_winners (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      coins_won BIGINT DEFAULT 700,
      role_id TEXT,
      role_expires_at BIGINT,
      won_at TIMESTAMP DEFAULT NOW()
    );
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
    const res = await pool.query(
      `INSERT INTO users (id, balance, tirages) 
       VALUES ($1, 100 + $2, 2) 
       ON CONFLICT (id) 
       DO UPDATE SET balance = users.balance + $2 
       RETURNING balance`,
      [id, BigInt(amount)]
    );
    return res.rows[0].balance;
  },
  setBalance: async (id, balance) => {
    const res = await pool.query(
      `INSERT INTO users (id, balance, tirages) 
       VALUES ($1, $2, 2) 
       ON CONFLICT (id) 
       DO UPDATE SET balance = $2 
       RETURNING balance`,
      [id, BigInt(balance)]
    );
    return res.rows[0].balance;
  },
  updateDaily: async (id, time) => {
    await pool.query(
      `INSERT INTO users (id, last_daily, balance, tirages) 
       VALUES ($1, $2, 100, 2) 
       ON CONFLICT (id) 
       DO UPDATE SET last_daily = $2`,
      [id, time.toString()]
    );
  },
  updateVole: async (id, time) => {
    await pool.query(
      `INSERT INTO users (id, last_vole, balance, tirages) 
       VALUES ($1, $2, 100, 2) 
       ON CONFLICT (id) 
       DO UPDATE SET last_vole = $2`,
      [id, time.toString()]
    );
  },
  updateTirages: async (id, amount) => {
    const res = await pool.query(
      `INSERT INTO users (id, tirages, balance) 
       VALUES ($1, 2 + $2, 100) 
       ON CONFLICT (id) 
       DO UPDATE SET tirages = users.tirages + $2 
       RETURNING tirages`,
      [id, amount]
    );
    return res.rows[0].tirages;
  },
  setTirages: async (id, amount) => {
    const res = await pool.query(
      `INSERT INTO users (id, tirages, balance) 
       VALUES ($1, $2, 100) 
       ON CONFLICT (id) 
       DO UPDATE SET tirages = $2 
       RETURNING tirages`,
      [id, amount]
    );
    return res.rows[0].tirages;
  },
  updateWeeklyTirage: async (id, time) => {
    await pool.query(
      `INSERT INTO users (id, last_weekly_tirage, balance, tirages) 
       VALUES ($1, $2, 100, 2) 
       ON CONFLICT (id) 
       DO UPDATE SET last_weekly_tirage = $2`,
      [id, time.toString()]
    );
  },
  updateBoost: async (id, time) => {
    await pool.query(
      `INSERT INTO users (id, last_boost, balance, tirages) 
       VALUES ($1, $2, 100, 2) 
       ON CONFLICT (id) 
       DO UPDATE SET last_boost = $2`,
      [id, time.toString()]
    );
  },
  getLeaderboard: async (limit = 10) => {
    const res = await pool.query(
      'SELECT id, balance FROM users ORDER BY balance DESC LIMIT $1',
      [limit]
    );
    return res.rows;
  },

  // Bounty System
  createBounty: async (title, description, reward, authorId) => {
    const res = await pool.query(
      'INSERT INTO bounties (title, description, reward, author_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, description, BigInt(reward), authorId]
    );
    return res.rows[0];
  },

  getBounty: async (id) => {
    const res = await pool.query('SELECT * FROM bounties WHERE id = $1', [id]);
    return res.rows[0];
  },

  getAllActiveBounties: async () => {
      const res = await pool.query('SELECT * FROM bounties WHERE status = \'active\' ORDER BY created_at DESC');
      return res.rows;
  },

  updateBountyMessageId: async (id, messageId) => {
    await pool.query('UPDATE bounties SET message_id = $1 WHERE id = $2', [messageId, id]);
  },

  // System Utils
  ping: async () => {
    const start = Date.now();
    await pool.query('SELECT 1');
    return Date.now() - start;
  },

  closeBounty: async (id, winnerId) => {
    await pool.query(
      'UPDATE bounties SET status = \'closed\', winner_id = $1 WHERE id = $2',
      [winnerId, id]
    );
  },

  getBountiesByAuthor: async (authorId) => {
    const res = await pool.query('SELECT * FROM bounties WHERE author_id = $1 ORDER BY created_at DESC', [authorId]);
    return res.rows;
  },

  getBountiesByWinner: async (winnerId) => {
    const res = await pool.query('SELECT * FROM bounties WHERE winner_id = $1 ORDER BY created_at DESC', [winnerId]);
    return res.rows;
  },

  // Config System
  setConfig: async (key, value) => {
    await pool.query(
      'INSERT INTO system_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      [key, value]
    );
  },

  getConfig: async (key) => {
    const res = await pool.query('SELECT value FROM system_config WHERE key = $1', [key]);
    return res.rows[0]?.value;
  },

  // Role Expiration System
  addRoleExpiration: async (userId, roleId, expiresAt) => {
    await pool.query(
      'INSERT INTO role_expirations (user_id, role_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (user_id, role_id) DO UPDATE SET expires_at = $3',
      [userId, roleId, expiresAt]
    );
  },

  getExpiredRoles: async (now) => {
    const res = await pool.query('SELECT * FROM role_expirations WHERE expires_at <= $1', [now]);
    return res.rows;
  },

  removeRoleExpiration: async (userId, roleId) => {
    await pool.query('DELETE FROM role_expirations WHERE user_id = $1 AND role_id = $2', [userId, roleId]);
  },

  getRoleExpiration: async (userId, roleId) => {
    const res = await pool.query(
      'SELECT expires_at FROM role_expirations WHERE user_id = $1 AND role_id = $2',
      [userId, roleId]
    );
    return res.rows[0];
  },

  // Braquage System
  addBraquageWinner: async (userId, code, coinsWon, roleId, roleExpiresAt) => {
    await pool.query(
      'INSERT INTO braquage_winners (user_id, code, coins_won, role_id, role_expires_at) VALUES ($1, $2, $3, $4, $5)',
      [userId, code, BigInt(coinsWon), roleId, roleExpiresAt]
    );
  },

  getExpiredBraquageRoles: async (now) => {
    const res = await pool.query(
      'SELECT * FROM braquage_winners WHERE role_expires_at IS NOT NULL AND role_expires_at <= $1',
      [now]
    );
    return res.rows;
  },

  clearBraquageRoleExpiration: async (id) => {
    await pool.query(
      'UPDATE braquage_winners SET role_expires_at = NULL WHERE id = $1',
      [id]
    );
  }
};
