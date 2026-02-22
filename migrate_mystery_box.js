/**
 * Script de migration — Crée la table mystery_box_inventory si elle n'existe pas.
 * Exécution : node migrate_mystery_box.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  console.log('[Migration] Création de la table mystery_box_inventory...');
  try {
    await pool.query(`
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
    console.log('[Migration] ✅ Table mystery_box_inventory créée (ou déjà existante).');
  } catch (err) {
    console.error('[Migration] ❌ Erreur :', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
