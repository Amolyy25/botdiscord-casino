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
      guild_id TEXT,
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

    CREATE TABLE IF NOT EXISTS active_braquages (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      code TEXT NOT NULL,
      embed_description TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shop_purchases (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      target_id TEXT,
      price BIGINT NOT NULL,
      purchased_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shop_effects (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      target_id TEXT,
      effect_type TEXT NOT NULL,
      value TEXT,
      extra_data TEXT,
      expires_at BIGINT,
      active BOOLEAN DEFAULT TRUE
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
  addRoleExpiration: async (userId, roleId, expiresAt, guildId = null) => {
    await pool.query(
      'INSERT INTO role_expirations (user_id, role_id, expires_at, guild_id) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, role_id) DO UPDATE SET expires_at = $3, guild_id = $4',
      [userId, roleId, expiresAt, guildId]
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
  },

  // Active Braquage Persistence
  createActiveBraquage: async (guildId, code, embedDescription, status = 'pending') => {
    const res = await pool.query(
      'INSERT INTO active_braquages (guild_id, code, embed_description, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [guildId, code, embedDescription, status]
    );
    return res.rows[0];
  },

  getActiveBraquage: async () => {
    const res = await pool.query(
      "SELECT * FROM active_braquages WHERE status IN ('pending', 'active') ORDER BY created_at DESC LIMIT 1"
    );
    return res.rows[0] || null;
  },

  updateBraquageStatus: async (id, status) => {
    await pool.query(
      'UPDATE active_braquages SET status = $1 WHERE id = $2',
      [status, id]
    );
  },

  closeAllActiveBraquages: async () => {
    await pool.query(
      "UPDATE active_braquages SET status = 'closed' WHERE status IN ('pending', 'active')"
    );
  },

  // Shop System
  addShopPurchase: async (userId, itemId, targetId, price) => {
    await pool.query(
      'INSERT INTO shop_purchases (user_id, item_id, target_id, price) VALUES ($1, $2, $3, $4)',
      [userId, itemId, targetId, BigInt(price)]
    );
  },

  addShopEffect: async (userId, targetId, effectType, value, extraData, expiresAt) => {
    const res = await pool.query(
      'INSERT INTO shop_effects (user_id, target_id, effect_type, value, extra_data, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [userId, targetId, effectType, value, extraData, expiresAt]
    );
    return res.rows[0];
  },

  getActiveShopEffects: async (userId, effectType) => {
    const res = await pool.query(
      'SELECT * FROM shop_effects WHERE user_id = $1 AND effect_type = $2 AND active = TRUE',
      [userId, effectType]
    );
    return res.rows;
  },

  hasActiveShopEffect: async (userId, effectType) => {
    const res = await pool.query(
      'SELECT COUNT(*) as count FROM shop_effects WHERE user_id = $1 AND effect_type = $2 AND active = TRUE',
      [userId, effectType]
    );
    return parseInt(res.rows[0].count) > 0;
  },

  consumeShopEffect: async (userId, effectType) => {
    const res = await pool.query(
      'UPDATE shop_effects SET active = FALSE WHERE id = (SELECT id FROM shop_effects WHERE user_id = $1 AND effect_type = $2 AND active = TRUE ORDER BY id LIMIT 1) RETURNING *',
      [userId, effectType]
    );
    return res.rows[0];
  },

  getExpiredShopEffects: async (now) => {
    const res = await pool.query(
      'SELECT * FROM shop_effects WHERE active = TRUE AND expires_at IS NOT NULL AND expires_at <= $1',
      [now]
    );
    return res.rows;
  },

  deactivateShopEffect: async (id) => {
    await pool.query(
      'UPDATE shop_effects SET active = FALSE WHERE id = $1',
      [id]
    );
  },

  // Persistence helpers — liste TOUS les effets actifs (pas que les expirés)
  getAllActiveShopEffectsList: async () => {
    const res = await pool.query(
      'SELECT * FROM shop_effects WHERE active = TRUE ORDER BY expires_at ASC'
    );
    return res.rows;
  },

  getAllPendingRoleExpirations: async () => {
    const res = await pool.query(
      'SELECT * FROM role_expirations ORDER BY expires_at ASC'
    );
    return res.rows;
  },

  getShopPurchases: async (userId, limit = 20) => {
    const res = await pool.query(
      'SELECT * FROM shop_purchases WHERE user_id = $1 ORDER BY purchased_at DESC LIMIT $2',
      [userId, limit]
    );
    return res.rows;
  },

  getShopPurchaseCount: async (userId) => {
    const res = await pool.query(
      'SELECT COUNT(*) as count, COALESCE(SUM(price), 0) as total_spent FROM shop_purchases WHERE user_id = $1',
      [userId]
    );
    return { count: parseInt(res.rows[0].count), totalSpent: BigInt(res.rows[0].total_spent) };
  }
};
