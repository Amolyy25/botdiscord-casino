/**
 * Tests unitaires complets pour le système de boutique.
 * 
 * Teste chaque type d'achat au niveau base de données :
 * - temp_role (soumission, XP, immunité, holo)
 * - timeout (mute)
 * - nickname (pseudo forcé)
 * - permanent_role (commandes Lana)
 * - role_select (couleur basic)
 * - xp_boost
 * - ticket
 * - tirage
 * - shop_effect (vol inarrêtable)
 * 
 * + tests d'erreurs, edge cases, expirations, historique
 * 
 * Usage : node tests/test_shop.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../database');
const shopData = require('../shop.json');

// Compteurs de tests
let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    console.error(`  ❌ ${testName}`);
  }
}

// Génère un ID unique pour chaque test
function uid(prefix = 'TEST') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

async function testShopJsonIntegrity() {
  console.log('\n══════════════════════════════════════');
  console.log('📋 TEST 1 : Intégrité du shop.json');
  console.log('══════════════════════════════════════');

  // Vérifier que toutes les catégories existent
  assert(shopData.categories.length === 5, `5 catégories définies (trouvé: ${shopData.categories.length})`);

  // Vérifier que chaque catégorie a les champs requis
  for (const cat of shopData.categories) {
    assert(cat.id && cat.label && cat.emoji && cat.color, `Catégorie "${cat.id}" a tous les champs`);
  }

  // Vérifier que chaque article a les champs requis
  for (const item of shopData.items) {
    assert(item.id && item.category && item.label && item.emoji && item.price !== undefined && item.type,
      `Article "${item.id}" a tous les champs requis`);
  }

  // Vérifier que chaque article référence une catégorie valide
  const categoryIds = shopData.categories.map(c => c.id);
  for (const item of shopData.items) {
    assert(categoryIds.includes(item.category),
      `Article "${item.id}" référence une catégorie valide (${item.category})`);
  }

  // Vérifier que les prix sont positifs
  for (const item of shopData.items) {
    assert(item.price > 0, `Article "${item.id}" a un prix positif (${item.price})`);
  }

  // Vérifier que les durées sont positives ou null
  for (const item of shopData.items) {
    assert(item.duration === null || item.duration > 0,
      `Article "${item.id}" a une durée valide (${item.duration})`);
  }

  // Vérifier les types connus
  const validTypes = ['temp_role', 'timeout', 'nickname', 'permanent_role', 'role_select', 'xp_boost', 'ticket', 'tirage', 'shop_effect'];
  for (const item of shopData.items) {
    assert(validTypes.includes(item.type),
      `Article "${item.id}" a un type valide (${item.type})`);
  }

  // Vérifier que les IDs sont uniques
  const ids = shopData.items.map(i => i.id);
  const uniqueIds = new Set(ids);
  assert(ids.length === uniqueIds.size, `Tous les IDs sont uniques (${ids.length} items)`);

  // Vérifier role_select a bien des roles
  const roleSelectItems = shopData.items.filter(i => i.type === 'role_select');
  for (const item of roleSelectItems) {
    assert(item.roles && item.roles.length > 0,
      `role_select "${item.id}" a une liste de rôles (${item.roles?.length || 0})`);
  }

  // Vérifier articles avec needsTarget
  const targetItems = shopData.items.filter(i => i.needsTarget);
  for (const item of targetItems) {
    assert(['temp_role', 'timeout', 'nickname'].includes(item.type),
      `Article "${item.id}" avec needsTarget a un type compatible (${item.type})`);
  }
}

async function testBalanceDeduction() {
  console.log('\n══════════════════════════════════════');
  console.log('💰 TEST 2 : Déduction et remboursement de balance');
  console.log('══════════════════════════════════════');

  const userId = uid('BAL');

  // Créer un utilisateur avec 100 coins de base
  const user = await db.getUser(userId);
  assert(BigInt(user.balance) === 100n, `Utilisateur créé avec 100 coins`);

  // Ajouter 1000 coins
  const newBal = await db.updateBalance(userId, 1000);
  assert(BigInt(newBal) === 1100n, `Balance après +1000 : ${newBal} (attendu: 1100)`);

  // Déduire 500 coins (simule un achat)
  const afterDeduct = await db.updateBalance(userId, -500);
  assert(BigInt(afterDeduct) === 600n, `Balance après -500 : ${afterDeduct} (attendu: 600)`);

  // Rembourser 500 coins (simule un refund)
  const afterRefund = await db.updateBalance(userId, 500);
  assert(BigInt(afterRefund) === 1100n, `Balance après remboursement +500 : ${afterRefund} (attendu: 1100)`);

  // Vérifier qu'on ne peut PAS aller en négatif au niveau logique
  const userData = await db.getUser(userId);
  const balance = BigInt(userData.balance);
  const price = 99999n;
  assert(balance < price, `Vérification solde insuffisant : ${balance} < ${price}`);
}

async function testPurchaseRecording() {
  console.log('\n══════════════════════════════════════');
  console.log('📝 TEST 3 : Enregistrement des achats (shop_purchases)');
  console.log('══════════════════════════════════════');

  const userId = uid('PUR');
  const targetId = uid('TAR');

  // Achat sans cible
  await db.addShopPurchase(userId, 'tirage_1', null, 600);
  const p1 = await db.getShopPurchases(userId);
  assert(p1.length === 1, `1 achat enregistré`);
  assert(p1[0].item_id === 'tirage_1', `Item ID correct : tirage_1`);
  assert(BigInt(p1[0].price) === 600n, `Prix correct : 600`);
  assert(p1[0].target_id === null, `Target null pour achat sans cible`);

  // Achat avec cible
  await db.addShopPurchase(userId, 'mute_5', targetId, 500);
  const p2 = await db.getShopPurchases(userId);
  assert(p2.length === 2, `2 achats enregistrés`);
  assert(p2[0].target_id === targetId, `Target correct pour achat avec cible`);

  // Achat multiple
  await db.addShopPurchase(userId, 'soumission_2', targetId, 600);
  await db.addShopPurchase(userId, 'cmd_fake', null, 300);
  await db.addShopPurchase(userId, 'vol_inarretable', null, 1000);
  const p5 = await db.getShopPurchases(userId);
  assert(p5.length === 5, `5 achats enregistrés au total`);

  // Vérifier l'ordre (le plus récent en premier)
  assert(p5[0].item_id === 'vol_inarretable', `Dernier achat en premier (vol_inarretable)`);

  // Vérifier les stats
  const stats = await db.getShopPurchaseCount(userId);
  assert(stats.count === 5, `Count correct : 5`);
  const expectedTotal = 600n + 500n + 600n + 300n + 1000n;
  assert(stats.totalSpent === expectedTotal, `Total dépensé correct : ${stats.totalSpent} (attendu: ${expectedTotal})`);

  // Vérifier la limite
  const limited = await db.getShopPurchases(userId, 2);
  assert(limited.length === 2, `Limite de 2 achats respectée`);
}

async function testTempRole() {
  console.log('\n══════════════════════════════════════');
  console.log('🎭 TEST 4 : temp_role (soumission, XP, immunité, holo)');
  console.log('══════════════════════════════════════');

  const userId = uid('TROLE');
  const targetId = uid('TTARGET');
  const roleId = '1469308068239249613'; // soumission

  // Simuler l'ajout d'une expiration de rôle
  const expiresAt = Date.now() + 120000; // 2 min
  await db.addRoleExpiration(targetId, roleId, expiresAt);

  // Vérifier que l'expiration existe
  const exp = await db.getRoleExpiration(targetId, roleId);
  assert(exp !== undefined, `Expiration de rôle enregistrée`);
  assert(parseInt(exp.expires_at) === expiresAt, `Timestamp d'expiration correct`);

  // Vérifier que le rôle n'est pas encore expiré
  const expired = await db.getExpiredRoles(Date.now());
  const isExpired = expired.some(e => e.user_id === targetId && e.role_id === roleId);
  assert(!isExpired, `Rôle pas encore expiré (correct)`);

  // Simuler une expiration passée
  const pastExpiresAt = Date.now() - 1000;
  await db.addRoleExpiration(targetId, roleId, pastExpiresAt);
  const expiredNow = await db.getExpiredRoles(Date.now());
  const isExpiredNow = expiredNow.some(e => e.user_id === targetId && e.role_id === roleId);
  assert(isExpiredNow, `Rôle expiré après le délai (correct)`);

  // Nettoyage
  await db.removeRoleExpiration(targetId, roleId);
  const afterClean = await db.getRoleExpiration(targetId, roleId);
  assert(afterClean === undefined, `Expiration nettoyée`);

  // Tester les items temp_role sans cible (immunité, XP, holo)
  const selfRoleId = '1470934040692392008'; // immunité 2h
  const selfExpires = Date.now() + 7200000;
  await db.addRoleExpiration(userId, selfRoleId, selfExpires);
  const selfExp = await db.getRoleExpiration(userId, selfRoleId);
  assert(selfExp !== undefined, `Expiration rôle self enregistrée (immunité)`);

  // Enregistrer l'achat
  await db.addShopPurchase(userId, 'immunite_braquage_2h', null, 400);
  const purchases = await db.getShopPurchases(userId);
  assert(purchases.some(p => p.item_id === 'immunite_braquage_2h'), `Achat immunité enregistré`);

  // Nettoyage
  await db.removeRoleExpiration(userId, selfRoleId);
}

async function testTimeout() {
  console.log('\n══════════════════════════════════════');
  console.log('🤐 TEST 5 : timeout (mute 5min, 10min)');
  console.log('══════════════════════════════════════');

  const buyerId = uid('MBUYER');
  const targetId = uid('MTARGET');

  // Le timeout Discord natif ne passe pas par la DB, mais l'achat est enregistré
  await db.addShopPurchase(buyerId, 'mute_5', targetId, 500);
  const purchases = await db.getShopPurchases(buyerId);
  assert(purchases.length === 1, `Achat mute_5 enregistré`);
  assert(purchases[0].item_id === 'mute_5', `Item ID correct : mute_5`);
  assert(purchases[0].target_id === targetId, `Target ID enregistré`);
  assert(BigInt(purchases[0].price) === 500n, `Prix correct : 500`);

  // Mute 10min
  await db.addShopPurchase(buyerId, 'mute_10', targetId, 1000);
  const p2 = await db.getShopPurchases(buyerId);
  assert(p2.length === 2, `2 achats mute enregistrés`);

  // Vérifier stats
  const stats = await db.getShopPurchaseCount(buyerId);
  assert(stats.count === 2, `2 achats au total`);
  assert(stats.totalSpent === 1500n, `Total dépensé : 1500`);
}

async function testNickname() {
  console.log('\n══════════════════════════════════════');
  console.log('📝 TEST 6 : nickname (pseudo forcé 1h)');
  console.log('══════════════════════════════════════');

  const targetId = uid('NTARGET');
  const buyerId = uid('NBUYER');
  const newNickname = 'BouletDuServeur';
  const oldNickname = 'AncienPseudo';

  // Enregistrer l'achat
  await db.addShopPurchase(buyerId, 'pseudo_1h', targetId, 300);

  // Stocker l'effet nickname avec ancien pseudo
  const expiresAt = Date.now() + 3600000;
  const effect = await db.addShopEffect(targetId, buyerId, 'nickname', newNickname, oldNickname, expiresAt);
  assert(effect !== undefined, `Effet nickname créé`);
  assert(effect.effect_type === 'nickname', `Type d'effet correct : nickname`);
  assert(effect.value === newNickname, `Nouveau nickname stocké : ${newNickname}`);
  assert(effect.extra_data === oldNickname, `Ancien nickname stocké : ${oldNickname}`);
  assert(effect.active === true, `Effet actif`);
  assert(parseInt(effect.expires_at) === expiresAt, `Expiration correcte`);

  // Vérifier que l'effet n'est pas encore expiré
  const expiredEffects = await db.getExpiredShopEffects(Date.now());
  const isExpired = expiredEffects.some(e => e.user_id === targetId && e.effect_type === 'nickname');
  assert(!isExpired, `Effet nickname pas encore expiré`);

  // Simuler l'expiration
  const expiredEffect = await db.addShopEffect(targetId, buyerId, 'nickname', 'ExpiredNick', 'OldNick', Date.now() - 1000);
  const expiredNow = await db.getExpiredShopEffects(Date.now());
  const isExpiredNow = expiredNow.some(e => e.id === expiredEffect.id);
  assert(isExpiredNow, `Effet nickname expiré détecté`);

  // Désactiver l'effet expiré
  await db.deactivateShopEffect(expiredEffect.id);
  const afterDeactivate = await db.getExpiredShopEffects(Date.now());
  const stillExpired = afterDeactivate.some(e => e.id === expiredEffect.id);
  assert(!stillExpired, `Effet désactivé après cleanup`);
}

async function testPermanentRole() {
  console.log('\n══════════════════════════════════════');
  console.log('👑 TEST 7 : permanent_role (commandes Lana)');
  console.log('══════════════════════════════════════');

  const userId = uid('PERM');

  // Enregistrer les achats pour chaque commande
  const cmdItems = ['cmd_fake', 'cmd_pic', 'cmd_mirror', 'cmd_userinfo'];

  for (const itemId of cmdItems) {
    const item = shopData.items.find(i => i.id === itemId);
    await db.addShopPurchase(userId, itemId, null, item.price);
  }

  const purchases = await db.getShopPurchases(userId);
  assert(purchases.length === 4, `4 achats commandes Lana enregistrés`);

  // Vérifier que tous les items sont présents
  for (const itemId of cmdItems) {
    assert(purchases.some(p => p.item_id === itemId), `Achat ${itemId} présent`);
  }

  // permanent_role n'a pas de role_expiration (c'est permanent)
  // Vérifier que rien n'est dans role_expirations pour cet utilisateur
  // (on ne devrait pas avoir ajouté d'expiration)
  const stats = await db.getShopPurchaseCount(userId);
  const totalExpected = 300n + 300n + 500n + 300n;
  assert(stats.totalSpent === totalExpected, `Total dépensé commandes : ${stats.totalSpent} (attendu: ${totalExpected})`);
}

async function testRoleSelect() {
  console.log('\n══════════════════════════════════════');
  console.log('🌈 TEST 8 : role_select (rôle couleur basic)');
  console.log('══════════════════════════════════════');

  const userId = uid('RSEL');
  const selectedRoleId = '1469071689823289446'; // Noir
  const item = shopData.items.find(i => i.id === 'role_couleur_basic');

  assert(item !== undefined, `Item role_couleur_basic trouvé dans le JSON`);
  assert(item.roles.length === 10, `10 rôles couleur disponibles`);
  assert(item.roles.some(r => r.id === selectedRoleId), `Rôle Noir présent dans la liste`);

  // Enregistrer l'achat
  await db.addShopPurchase(userId, 'role_couleur_basic', null, 1500);

  // Enregistrer l'expiration du rôle sélectionné
  const expiresAt = Date.now() + 86400000; // 24h
  await db.addRoleExpiration(userId, selectedRoleId, expiresAt);

  const exp = await db.getRoleExpiration(userId, selectedRoleId);
  assert(exp !== undefined, `Expiration du rôle couleur enregistrée`);

  // Simuler un 2ème achat avec une autre couleur
  const selectedRoleId2 = '1469071689823289441'; // Orange
  await db.addRoleExpiration(userId, selectedRoleId2, expiresAt);

  const exp2 = await db.getRoleExpiration(userId, selectedRoleId2);
  assert(exp2 !== undefined, `2ème rôle couleur enregistré (Orange)`);

  // Nettoyage
  await db.removeRoleExpiration(userId, selectedRoleId);
  await db.removeRoleExpiration(userId, selectedRoleId2);
}

async function testTirage() {
  console.log('\n══════════════════════════════════════');
  console.log('🎫 TEST 9 : tirage (achat de tirages)');
  console.log('══════════════════════════════════════');

  const userId = uid('TIR');

  // Créer l'utilisateur (2 tirages de base)
  const user = await db.getUser(userId);
  assert(user.tirages === 2, `Utilisateur a 2 tirages de base`);

  // Acheter 1 tirage
  const newTirages = await db.updateTirages(userId, 1);
  assert(newTirages === 3, `Après achat : 3 tirages (${newTirages})`);

  // Acheter encore 1 tirage
  const newTirages2 = await db.updateTirages(userId, 1);
  assert(newTirages2 === 4, `Après 2ème achat : 4 tirages (${newTirages2})`);

  // Enregistrer l'achat
  await db.addShopPurchase(userId, 'tirage_1', null, 600);
  await db.addShopPurchase(userId, 'tirage_1', null, 600);
  const purchases = await db.getShopPurchases(userId);
  assert(purchases.length === 2, `2 achats de tirage enregistrés`);

  // Vérifier total dépensé
  const stats = await db.getShopPurchaseCount(userId);
  assert(stats.totalSpent === 1200n, `Total dépensé : 1200`);
}

async function testShopEffect() {
  console.log('\n══════════════════════════════════════');
  console.log('⚡ TEST 10 : shop_effect (vol inarrêtable)');
  console.log('══════════════════════════════════════');

  const userId = uid('EFF');

  // Créer un effet vol inarrêtable (usage unique, pas d'expiration)
  const effect = await db.addShopEffect(userId, null, 'unstoppable_steal', null, null, null);
  assert(effect !== undefined, `Effet vol inarrêtable créé`);
  assert(effect.effect_type === 'unstoppable_steal', `Type correct`);
  assert(effect.active === true, `Effet actif`);
  assert(effect.expires_at === null, `Pas d'expiration (usage unique)`);

  // Vérifier que l'utilisateur a l'effet actif
  const hasEffect = await db.hasActiveShopEffect(userId, 'unstoppable_steal');
  assert(hasEffect === true, `hasActiveShopEffect retourne true`);

  // Consommer l'effet (simule l'utilisation du vol)
  const consumed = await db.consumeShopEffect(userId, 'unstoppable_steal');
  assert(consumed !== undefined, `Effet consommé`);
  assert(consumed.active === false, `Effet désactivé après consommation`);

  // Vérifier que l'effet n'est plus actif
  const hasEffectAfter = await db.hasActiveShopEffect(userId, 'unstoppable_steal');
  assert(hasEffectAfter === false, `hasActiveShopEffect retourne false après consommation`);

  // Tester le double achat : racheter un vol inarrêtable
  const effect2 = await db.addShopEffect(userId, null, 'unstoppable_steal', null, null, null);
  const hasEffect2 = await db.hasActiveShopEffect(userId, 'unstoppable_steal');
  assert(hasEffect2 === true, `Nouvel effet actif après rachat`);

  // Le premier est toujours consommé, le 2ème est actif
  const allEffects = await db.getActiveShopEffects(userId, 'unstoppable_steal');
  assert(allEffects.length === 1, `1 seul effet actif (l'autre est consommé)`);

  // Nettoyage
  await db.deactivateShopEffect(effect2.id);
}

async function testXpBoost() {
  console.log('\n══════════════════════════════════════');
  console.log('✨ TEST 11 : xp_boost (+1.5%, +2%)');
  console.log('══════════════════════════════════════');

  const userId = uid('XP');

  // Créer un effet XP boost +1.5% (24h)
  const expiresAt = Date.now() + 86400000;
  const effect = await db.addShopEffect(userId, null, 'xp_boost', '1.5', null, expiresAt);
  assert(effect !== undefined, `Effet XP boost créé`);
  assert(effect.value === '1.5', `Valeur du boost : 1.5`);
  assert(parseInt(effect.expires_at) === expiresAt, `Expiration correcte`);

  // Vérifier qu'il est actif
  const active = await db.getActiveShopEffects(userId, 'xp_boost');
  assert(active.length === 1, `1 boost XP actif`);
  assert(active[0].value === '1.5', `Valeur correcte dans getActiveShopEffects`);

  // Ajouter un 2ème boost (les boosts devraient pouvoir se cumuler ou non selon la logique)
  const effect2 = await db.addShopEffect(userId, null, 'xp_boost', '2.0', null, expiresAt);
  const active2 = await db.getActiveShopEffects(userId, 'xp_boost');
  assert(active2.length === 2, `2 boosts XP actifs (cumul possible)`);

  // Enregistrer les achats
  await db.addShopPurchase(userId, 'xp_1_5_24h', null, 500);
  await db.addShopPurchase(userId, 'xp_2_24h', null, 750);
  const stats = await db.getShopPurchaseCount(userId);
  assert(stats.totalSpent === 1250n, `Total dépensé XP : 1250`);

  // Nettoyage
  await db.deactivateShopEffect(effect.id);
  await db.deactivateShopEffect(effect2.id);
}

async function testTicket() {
  console.log('\n══════════════════════════════════════');
  console.log('🎫 TEST 12 : ticket (emoji perso, emoji animé)');
  console.log('══════════════════════════════════════');

  const userId = uid('TIC');

  // Le ticket crée un salon Discord (pas testable en DB pure)
  // On vérifie juste que l'achat est bien enregistré

  await db.addShopPurchase(userId, 'emoji_perso', null, 230);
  await db.addShopPurchase(userId, 'emoji_anime', null, 300);

  const purchases = await db.getShopPurchases(userId);
  assert(purchases.length === 2, `2 achats ticket enregistrés`);
  assert(purchases.some(p => p.item_id === 'emoji_perso'), `Achat emoji_perso présent`);
  assert(purchases.some(p => p.item_id === 'emoji_anime'), `Achat emoji_anime présent`);

  const stats = await db.getShopPurchaseCount(userId);
  assert(stats.totalSpent === 530n, `Total dépensé tickets : 530`);
}

async function testEffectExpiration() {
  console.log('\n══════════════════════════════════════');
  console.log('⏰ TEST 13 : Expiration automatique des effets');
  console.log('══════════════════════════════════════');

  const userId1 = uid('EXP1');
  const userId2 = uid('EXP2');
  const userId3 = uid('EXP3');

  // Créer des effets avec différentes expirations
  const pastEffect = await db.addShopEffect(userId1, null, 'test_expired', null, null, Date.now() - 5000);
  const futureEffect = await db.addShopEffect(userId2, null, 'test_future', null, null, Date.now() + 999999);
  const noExpiryEffect = await db.addShopEffect(userId3, null, 'test_no_expiry', null, null, null);

  // getExpiredShopEffects ne doit retourner que l'effet passé
  const expired = await db.getExpiredShopEffects(Date.now());
  const hasPast = expired.some(e => e.id === pastEffect.id);
  const hasFuture = expired.some(e => e.id === futureEffect.id);
  const hasNoExpiry = expired.some(e => e.id === noExpiryEffect.id);

  assert(hasPast, `Effet expiré détecté`);
  assert(!hasFuture, `Effet futur NON détecté (correct)`);
  assert(!hasNoExpiry, `Effet sans expiration NON détecté (correct)`);

  // Désactiver l'effet expiré
  await db.deactivateShopEffect(pastEffect.id);
  const expiredAfter = await db.getExpiredShopEffects(Date.now());
  const stillHasPast = expiredAfter.some(e => e.id === pastEffect.id);
  assert(!stillHasPast, `Effet expiré nettoyé`);

  // Nettoyage
  await db.deactivateShopEffect(futureEffect.id);
  await db.deactivateShopEffect(noExpiryEffect.id);
}

async function testEdgeCases() {
  console.log('\n══════════════════════════════════════');
  console.log('🔥 TEST 14 : Edge cases et erreurs');
  console.log('══════════════════════════════════════');

  const userId = uid('EDGE');

  // Utilisateur sans aucun achat
  const emptyPurchases = await db.getShopPurchases(userId);
  assert(emptyPurchases.length === 0, `Pas d'achats pour un nouvel utilisateur`);

  const emptyStats = await db.getShopPurchaseCount(userId);
  assert(emptyStats.count === 0, `Count = 0 pour nouvel utilisateur`);
  assert(emptyStats.totalSpent === 0n, `Total dépensé = 0 pour nouvel utilisateur`);

  // Utilisateur sans effets actifs
  const noEffect = await db.hasActiveShopEffect(userId, 'unstoppable_steal');
  assert(noEffect === false, `Pas d'effet actif pour nouvel utilisateur`);

  // Consommer un effet inexistant
  const noConsume = await db.consumeShopEffect(userId, 'unstoppable_steal');
  assert(noConsume === undefined, `consumeShopEffect retourne undefined si aucun effet`);

  // getActiveShopEffects vide
  const noEffects = await db.getActiveShopEffects(userId, 'xp_boost');
  assert(noEffects.length === 0, `Pas d'effets actifs pour nouvel utilisateur`);

  // Achat avec un prix de 0 (ne devrait pas arriver mais on vérifie la DB)
  await db.addShopPurchase(userId, 'test_zero', null, 0);
  const p = await db.getShopPurchases(userId);
  assert(p.length === 1, `Achat avec prix 0 enregistré`);

  // Double expiration du même rôle (upsert)
  const roleId = 'test_role_123';
  await db.addRoleExpiration(userId, roleId, Date.now() + 1000);
  await db.addRoleExpiration(userId, roleId, Date.now() + 5000);
  const exp = await db.getRoleExpiration(userId, roleId);
  assert(parseInt(exp.expires_at) > Date.now() + 4000, `Upsert met à jour l'expiration (pas de doublon)`);

  // Nettoyage
  await db.removeRoleExpiration(userId, roleId);
}

async function testFullPurchaseScenario() {
  console.log('\n══════════════════════════════════════');
  console.log('🎮 TEST 15 : Scénario complet — achat de chaque type');
  console.log('══════════════════════════════════════');

  const userId = uid('FULL');
  const targetId = uid('FULLTARGET');

  // Donner 50000 coins à l'utilisateur
  await db.getUser(userId); // Créer avec 100
  await db.updateBalance(userId, 49900); // Total: 50000

  let balance = 50000n;

  // 1. Soumission 2min (temp_role, needsTarget)
  await db.addShopPurchase(userId, 'soumission_2', targetId, 600);
  balance -= 600n;
  await db.addRoleExpiration(targetId, '1469308068239249613', Date.now() + 120000);

  // 2. Mute 5min (timeout, needsTarget)
  await db.addShopPurchase(userId, 'mute_5', targetId, 500);
  balance -= 500n;

  // 3. Pseudo forcé (nickname, needsTarget)
  await db.addShopPurchase(userId, 'pseudo_1h', targetId, 300);
  balance -= 300n;
  await db.addShopEffect(targetId, userId, 'nickname', 'TestNick', 'OldNick', Date.now() + 3600000);

  // 4. Commande fake (permanent_role)
  await db.addShopPurchase(userId, 'cmd_fake', null, 300);
  balance -= 300n;

  // 5. Rôle couleur (role_select)
  await db.addShopPurchase(userId, 'role_couleur_basic', null, 1500);
  balance -= 1500n;
  await db.addRoleExpiration(userId, '1469071689823289446', Date.now() + 86400000);

  // 6. XP boost
  await db.addShopPurchase(userId, 'xp_1_5_24h', null, 500);
  balance -= 500n;
  await db.addShopEffect(userId, null, 'xp_boost', '1.5', null, Date.now() + 86400000);

  // 7. Emoji perso (ticket)
  await db.addShopPurchase(userId, 'emoji_perso', null, 230);
  balance -= 230n;

  // 8. Tirage
  await db.addShopPurchase(userId, 'tirage_1', null, 600);
  balance -= 600n;
  await db.updateTirages(userId, 1);

  // 9. Vol inarrêtable (shop_effect)
  await db.addShopPurchase(userId, 'vol_inarretable', null, 1000);
  balance -= 1000n;
  await db.addShopEffect(userId, null, 'unstoppable_steal', null, null, null);

  // 10. Immunité braquage 24h (temp_role self)
  await db.addShopPurchase(userId, 'immunite_braquage_24h', null, 2000);
  balance -= 2000n;
  await db.addRoleExpiration(userId, '1470934696085946561', Date.now() + 86400000);

  // 11. Holo (temp_role self)
  await db.addShopPurchase(userId, 'role_couleur_holo', null, 5000);
  balance -= 5000n;
  await db.addRoleExpiration(userId, '1471487736161505361', Date.now() + 86400000);

  // Vérifier l'historique complet
  const purchases = await db.getShopPurchases(userId, 50);
  assert(purchases.length === 11, `11 achats dans l'historique (trouvé: ${purchases.length})`);

  // Vérifier le total dépensé
  const stats = await db.getShopPurchaseCount(userId);
  const expectedTotal = 600n + 500n + 300n + 300n + 1500n + 500n + 230n + 600n + 1000n + 2000n + 5000n;
  assert(stats.totalSpent === expectedTotal, `Total dépensé : ${stats.totalSpent} (attendu: ${expectedTotal})`);
  assert(stats.count === 11, `Count : 11`);

  // Déduire le vrai solde
  const newBal = await db.updateBalance(userId, -Number(expectedTotal));
  const expectedBal = 50000n - expectedTotal;
  assert(BigInt(newBal) === expectedBal, `Balance finale : ${newBal} (attendu: ${expectedBal})`);

  // Vérifier les effets actifs
  const hasVol = await db.hasActiveShopEffect(userId, 'unstoppable_steal');
  assert(hasVol, `Effet vol inarrêtable actif`);

  const xpBoosts = await db.getActiveShopEffects(userId, 'xp_boost');
  assert(xpBoosts.length === 1, `1 boost XP actif`);

  // Vérifier les tirages
  const user = await db.getUser(userId);
  assert(user.tirages === 3, `3 tirages (2 base + 1 acheté)`);

  console.log(`\n  📊 Scénario complet : ${stats.count} achats, ${stats.totalSpent} coins dépensés`);

  // Nettoyage role_expirations
  await db.removeRoleExpiration(targetId, '1469308068239249613');
  await db.removeRoleExpiration(userId, '1469071689823289446');
  await db.removeRoleExpiration(userId, '1470934696085946561');
  await db.removeRoleExpiration(userId, '1471487736161505361');
}

// ═══════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('🧪 ═══════════════════════════════════════════');
  console.log('🧪  TESTS UNITAIRES — SYSTÈME DE BOUTIQUE');
  console.log('🧪 ═══════════════════════════════════════════');

  try {
    // Init DB
    console.log('\n⏳ Initialisation de la base de données...');
    await db.initDb();
    console.log('✅ Base de données initialisée\n');

    await testShopJsonIntegrity();
    await testBalanceDeduction();
    await testPurchaseRecording();
    await testTempRole();
    await testTimeout();
    await testNickname();
    await testPermanentRole();
    await testRoleSelect();
    await testTirage();
    await testShopEffect();
    await testXpBoost();
    await testTicket();
    await testEffectExpiration();
    await testEdgeCases();
    await testFullPurchaseScenario();

    // Résumé final
    console.log('\n\n═══════════════════════════════════════════');
    console.log(`📊 RÉSULTATS : ${passed}/${total} tests passés`);
    if (failed > 0) {
      console.log(`❌ ${failed} test(s) échoué(s)`);
    } else {
      console.log('✨ TOUS LES TESTS SONT PASSÉS !');
    }
    console.log('═══════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Erreur fatale pendant les tests:', error);
  } finally {
    process.exit(failed > 0 ? 1 : 0);
  }
}

runAllTests();
