const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Increase pool size for concurrency
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      balance BIGINT DEFAULT 100,
      last_daily BIGINT DEFAULT 0,
      last_vole BIGINT DEFAULT 0,
      last_collect BIGINT DEFAULT 0,
      tirages INTEGER DEFAULT 2,
      last_weekly_tirage BIGINT DEFAULT 0,
      last_boost BIGINT DEFAULT 0,
      prestige INTEGER DEFAULT 0
    );

    -- Migration for existing tables
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_collect') THEN
            ALTER TABLE users ADD COLUMN last_collect BIGINT DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='prestige') THEN
            ALTER TABLE users ADD COLUMN prestige INTEGER DEFAULT 0;
        END IF;
    END $$;
    
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

    CREATE TABLE IF NOT EXISTS bot_status (
      key TEXT PRIMARY KEY,
      value TEXT,
      end_time BIGINT
    );

    CREATE TABLE IF NOT EXISTS giveaways (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      host_id TEXT NOT NULL,
      prize_type TEXT NOT NULL,
      prize_value TEXT NOT NULL,
      winner_count INTEGER DEFAULT 1,
      ends_at BIGINT NOT NULL,
      temp_role_duration BIGINT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS giveaway_participants (
      giveaway_id INTEGER REFERENCES giveaways(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      PRIMARY KEY (giveaway_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id SERIAL PRIMARY KEY,
      task_type TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT,
      execute_at BIGINT NOT NULL,
      completed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS balance_history (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount BIGINT NOT NULL,
      reason TEXT DEFAULT 'Autre',
      balance_after BIGINT,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_balhis_user ON balance_history(user_id);

    CREATE TABLE IF NOT EXISTS mystery_box_inventory (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      giveaway_id INTEGER,
      default_prize_type TEXT,
      default_prize_value TEXT,
      default_prize_label TEXT,
      status TEXT DEFAULT 'pending_choice',
      opened BOOLEAN DEFAULT FALSE,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mb_user ON mystery_box_inventory(user_id);
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
  updateBalance: async (id, amount, reason = 'Autre') => {
    const res = await pool.query(
      `INSERT INTO users (id, balance, tirages) 
       VALUES ($1, 100 + $2, 2) 
       ON CONFLICT (id) 
       DO UPDATE SET balance = users.balance + $2 
       RETURNING balance`,
      [id, BigInt(amount)]
    );
    const balanceAfter = res.rows[0].balance;
    // Auto-log to balance_history
    await pool.query(
      `INSERT INTO balance_history (user_id, amount, reason, balance_after, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, BigInt(amount), reason, balanceAfter, Date.now()]
    ).catch(err => console.error('[BalHis] Erreur log:', err.message));
    return balanceAfter;
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
  updateCollect: async (id, time) => {
    await pool.query(
      `INSERT INTO users (id, last_collect, balance, tirages) 
       VALUES ($1, $2, 100, 2) 
       ON CONFLICT (id) 
       DO UPDATE SET last_collect = $2`,
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

  // Event Status System
  setEventStatus: async (key, active, endTime) => {
    await pool.query(
      'INSERT INTO bot_status (key, value, end_time) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = $2, end_time = $3',
      [key, active.toString(), endTime]
    );
  },

  getEventStatus: async (key) => {
    const res = await pool.query('SELECT * FROM bot_status WHERE key = $1', [key]);
    return res.rows[0];
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
  },

  getDailyShopPurchaseCount: async (userId, itemId) => {
    const res = await pool.query(
      "SELECT COUNT(*) as count FROM shop_purchases WHERE user_id = $1 AND item_id = $2 AND purchased_at >= CURRENT_DATE",
      [userId, itemId]
    );
    return parseInt(res.rows[0].count);
  },

  // ═══════════════════════════════════════════════
  // Giveaway System
  // ═══════════════════════════════════════════════

  createGiveaway: async ({ guildId, channelId, messageId, hostId, prizeType, prizeValue, winnerCount, endsAt, tempRoleDuration }) => {
    const res = await pool.query(
      `INSERT INTO giveaways (guild_id, channel_id, message_id, host_id, prize_type, prize_value, winner_count, ends_at, temp_role_duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [guildId, channelId, messageId, hostId, prizeType, prizeValue, winnerCount, endsAt, tempRoleDuration || null]
    );
    return res.rows[0];
  },

  getActiveGiveaways: async () => {
    const res = await pool.query("SELECT * FROM giveaways WHERE status = 'active' ORDER BY ends_at ASC");
    return res.rows;
  },

  getGiveaway: async (id) => {
    const res = await pool.query('SELECT * FROM giveaways WHERE id = $1', [id]);
    return res.rows[0];
  },

  getGiveawayByMessage: async (messageId) => {
    const res = await pool.query('SELECT * FROM giveaways WHERE message_id = $1', [messageId]);
    return res.rows[0];
  },

  updateGiveawayMessage: async (id, messageId) => {
    await pool.query('UPDATE giveaways SET message_id = $1 WHERE id = $2', [messageId, id]);
  },

  endGiveaway: async (id) => {
    await pool.query("UPDATE giveaways SET status = 'ended' WHERE id = $1", [id]);
  },

  cancelGiveaway: async (id) => {
    await pool.query("UPDATE giveaways SET status = 'cancelled' WHERE id = $1", [id]);
  },

  addGiveawayParticipant: async (giveawayId, userId) => {
    const res = await pool.query(
      'INSERT INTO giveaway_participants (giveaway_id, user_id) VALUES ($1, $2) ON CONFLICT (giveaway_id, user_id) DO NOTHING RETURNING *',
      [giveawayId, userId]
    );
    return res.rows.length > 0; // true = newly added, false = already existed
  },

  isGiveawayParticipant: async (giveawayId, userId) => {
    const res = await pool.query(
      'SELECT 1 FROM giveaway_participants WHERE giveaway_id = $1 AND user_id = $2',
      [giveawayId, userId]
    );
    return res.rows.length > 0;
  },

  getGiveawayParticipants: async (giveawayId) => {
    const res = await pool.query(
      'SELECT user_id FROM giveaway_participants WHERE giveaway_id = $1',
      [giveawayId]
    );
    return res.rows.map(r => r.user_id);
  },

  getGiveawayParticipantCount: async (giveawayId) => {
    const res = await pool.query(
      'SELECT COUNT(*) as count FROM giveaway_participants WHERE giveaway_id = $1',
      [giveawayId]
    );
    return parseInt(res.rows[0].count);
  },

  // ═══════════════════════════════════════════════
  // Scheduled Tasks (generic)
  // ═══════════════════════════════════════════════

  addScheduledTask: async ({ taskType, guildId, userId, roleId, executeAt }) => {
    const res = await pool.query(
      'INSERT INTO scheduled_tasks (task_type, guild_id, user_id, role_id, execute_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [taskType, guildId, userId, roleId || null, executeAt]
    );
    return res.rows[0];
  },

  getPendingScheduledTasks: async (now) => {
    const res = await pool.query(
      'SELECT * FROM scheduled_tasks WHERE completed = FALSE AND execute_at <= $1',
      [now]
    );
    return res.rows;
  },

  completeScheduledTask: async (id) => {
    await pool.query('UPDATE scheduled_tasks SET completed = TRUE WHERE id = $1', [id]);
  },

  getAllPendingScheduledTasks: async () => {
    const res = await pool.query(
      'SELECT * FROM scheduled_tasks WHERE completed = FALSE ORDER BY execute_at ASC'
    );
    return res.rows;
  },

  getBalanceHistory: async (userId, limit = 15, offset = 0) => {
    const res = await pool.query(
      `SELECT * FROM balance_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const countRes = await pool.query(
      'SELECT COUNT(*) as total FROM balance_history WHERE user_id = $1',
      [userId]
    );
    return { rows: res.rows, total: parseInt(countRes.rows[0].total) };
  },

  // ═══════════════════════════════════════════════
  // Mystery Box Inventory System
  // ═══════════════════════════════════════════════

  /**
   * Ajoute une Mystery Box à l'inventaire du membre (non ouverte).
   */
  giveMysteryBox: async (userId, guildId, giveawayId, defaultPrizeType, defaultPrizeValue, defaultPrizeLabel) => {
    const res = await pool.query(
      `INSERT INTO mystery_box_inventory
         (user_id, guild_id, giveaway_id, default_prize_type, default_prize_value, default_prize_label, status, opened, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_choice', FALSE, $7) RETURNING *`,
      [userId, guildId, giveawayId, defaultPrizeType, defaultPrizeValue, defaultPrizeLabel, Date.now()]
    );
    return res.rows[0];
  },

  /**
   * Récupère la première Mystery Box "choisie" (status = 'box_chosen') non ouverte.
   */
  getUserPendingBox: async (userId) => {
    const res = await pool.query(
      `SELECT * FROM mystery_box_inventory
       WHERE user_id = $1 AND status = 'box_chosen' AND opened = FALSE
       ORDER BY created_at ASC LIMIT 1`,
      [userId]
    );
    return res.rows[0] || null;
  },

  /**
   * Nombre de boxes en attente d'ouverture.
   */
  getUserBoxCount: async (userId) => {
    const res = await pool.query(
      `SELECT COUNT(*) as count FROM mystery_box_inventory
       WHERE user_id = $1 AND status = 'box_chosen' AND opened = FALSE`,
      [userId]
    );
    return parseInt(res.rows[0].count);
  },

  /**
   * Marque une box comme ouverte.
   */
  consumeMysteryBox: async (boxId) => {
    await pool.query(
      `UPDATE mystery_box_inventory SET opened = TRUE, status = 'opened' WHERE id = $1`,
      [boxId]
    );
  },

  /**
   * Met à jour le statut d'une box (ex: pending_choice → box_chosen | default_taken)
   */
  updateMysteryBoxStatus: async (boxId, status) => {
    await pool.query(
      `UPDATE mystery_box_inventory SET status = $1 WHERE id = $2`,
      [status, boxId]
    );
  },

  /**
   * Récupère une box par son ID.
   */
  getMysteryBox: async (boxId) => {
    const res = await pool.query(
      `SELECT * FROM mystery_box_inventory WHERE id = $1`,
      [boxId]
    );
    return res.rows[0] || null;
  },

  updatePrestige: async (id, newPrestige) => {
    await pool.query(
      `UPDATE users SET prestige = $2, balance = 0 WHERE id = $1`,
      [id, newPrestige]
    );
    // Log to balance history as a reset
    await pool.query(
      `INSERT INTO balance_history (user_id, amount, reason, balance_after, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, 0n, 'Prestige Reset', 0n, Date.now()]
    ).catch(err => console.error('[BalHis] Erreur log prestige:', err.message));
  }
};
