/**
 * Migration : Ajout des tables shop_purchases et shop_effects
 * 
 * Usage : node migrate_shop.js
 * 
 * Cette migration est idempotente (CREATE IF NOT EXISTS).
 * Elle peut être relancée sans risque sur une base existante.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  console.log('🔧 Migration Shop — Démarrage...\n');

  try {
    // ═══ Table shop_purchases ═══
    console.log('1. Création de la table shop_purchases...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_purchases (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        target_id TEXT,
        price BIGINT NOT NULL,
        purchased_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('   ✅ shop_purchases OK');

    // Index pour recherche par user_id (historique achats)
    console.log('2. Création des index shop_purchases...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shop_purchases_user_id 
      ON shop_purchases (user_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shop_purchases_purchased_at 
      ON shop_purchases (purchased_at DESC);
    `);
    console.log('   ✅ Index shop_purchases OK');

    // ═══ Table shop_effects ═══
    console.log('3. Création de la table shop_effects...');
    await pool.query(`
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
    console.log('   ✅ shop_effects OK');

    // Index pour recherche d'effets actifs et expirés
    console.log('4. Création des index shop_effects...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shop_effects_user_active 
      ON shop_effects (user_id, effect_type, active);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shop_effects_expires 
      ON shop_effects (expires_at) WHERE active = TRUE AND expires_at IS NOT NULL;
    `);
    console.log('   ✅ Index shop_effects OK');

    // ═══ Vérification ═══
    console.log('\n5. Vérification des tables...');

    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('shop_purchases', 'shop_effects')
      ORDER BY table_name;
    `);

    for (const row of tables.rows) {
      const countRes = await pool.query(`SELECT COUNT(*) as count FROM ${row.table_name}`);
      console.log(`   ✅ ${row.table_name} — ${countRes.rows[0].count} entrées`);
    }

    console.log('\n════════════════════════════════════════');
    console.log('✨ Migration Shop terminée avec succès !');
    console.log('════════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ Erreur pendant la migration:', error);
  } finally {
    await pool.end();
    process.exit();
  }
}

migrate();
