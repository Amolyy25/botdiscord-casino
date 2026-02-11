const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../database');

async function testBraquage() {
    console.log('🧪 Démarrage des tests du module Braquage...');

    const testUserId = 'TEST_BRAQUAGE_' + Date.now();
    const testCode = '1234';
    const testCoins = 700;
    const testRoleId = '1470554786502803638'; // Rôle Braquage

    try {
        // 0. Initialiser la base (créer les tables si nécessaire)
        console.log('\n0. Initialisation de la base de données...');
        await db.initDb();
        console.log('✅ Base de données initialisée');

        // ═══════════════════════════════════════════
        // TEST 1 : Ajout d'un gagnant de braquage
        // ═══════════════════════════════════════════
        console.log('\n1. Test de l\'ajout d\'un gagnant de braquage...');
        const expiresAt = Date.now() + 5000; // Expire dans 5 secondes pour le test
        await db.addBraquageWinner(testUserId, testCode, testCoins, testRoleId, expiresAt);
        console.log(`✅ Gagnant ajouté : ${testUserId} (code: ${testCode}, coins: ${testCoins})`);

        // ═══════════════════════════════════════════
        // TEST 2 : Vérifier que le rôle n'est pas encore expiré
        // ═══════════════════════════════════════════
        console.log('\n2. Vérification avant expiration...');
        const expiredBefore = await db.getExpiredBraquageRoles(Date.now());
        const isFoundBefore = expiredBefore.some(e => e.user_id === testUserId);
        if (!isFoundBefore) {
            console.log('✅ Le rôle n\'est pas listé comme expiré (Correct)');
        } else {
            console.error('❌ Le rôle est déjà listé comme expiré avant le délai !');
        }

        // ═══════════════════════════════════════════
        // TEST 3 : Attendre l'expiration et vérifier
        // ═══════════════════════════════════════════
        console.log('\n3. Attente de 6 secondes pour l\'expiration...');
        await new Promise(resolve => setTimeout(resolve, 6000));

        console.log('\n4. Vérification après expiration...');
        const expiredAfter = await db.getExpiredBraquageRoles(Date.now());
        const isFoundAfter = expiredAfter.some(e => e.user_id === testUserId);
        if (isFoundAfter) {
            console.log('✅ Le rôle est maintenant listé comme expiré (Correct)');
        } else {
            console.error('❌ Le rôle n\'est pas listé comme expiré après le délai !');
        }

        // ═══════════════════════════════════════════
        // TEST 4 : Nettoyage de l'expiration
        // ═══════════════════════════════════════════
        console.log('\n5. Test du nettoyage de l\'expiration (clearBraquageRoleExpiration)...');
        // Trouver l'ID de l'entrée
        const entryToClean = expiredAfter.find(e => e.user_id === testUserId);
        if (entryToClean) {
            await db.clearBraquageRoleExpiration(entryToClean.id);
            const expiredFinal = await db.getExpiredBraquageRoles(Date.now());
            const isFoundFinal = expiredFinal.some(e => e.user_id === testUserId);
            if (!isFoundFinal) {
                console.log('✅ L\'expiration a été nettoyée (role_expires_at = NULL) (Correct)');
            } else {
                console.error('❌ L\'expiration est toujours active après nettoyage !');
            }
        } else {
            console.error('❌ Impossible de trouver l\'entrée à nettoyer');
        }

        // ═══════════════════════════════════════════
        // TEST 5 : Vérifier que updateBalance fonctionne (coins)
        // ═══════════════════════════════════════════
        console.log('\n6. Test de l\'ajout de coins au gagnant...');
        const testCoinUserId = 'TEST_COINS_BRAQUAGE_' + Date.now();
        const newBalance = await db.updateBalance(testCoinUserId, testCoins);
        // L'utilisateur est créé avec 100 de base + 700 = 800
        const expectedBalance = BigInt(100) + BigInt(testCoins);
        if (BigInt(newBalance) === expectedBalance) {
            console.log(`✅ Balance correcte après ajout : ${newBalance} (100 base + ${testCoins} braquage)`);
        } else {
            console.error(`❌ Balance incorrecte : attendu ${expectedBalance}, obtenu ${newBalance}`);
        }

        // ═══════════════════════════════════════════
        // TEST 6 : Vérifier role_expirations (double sécurité)
        // ═══════════════════════════════════════════
        console.log('\n7. Test de la double sécurité (role_expirations)...');
        const testDoubleUserId = 'TEST_DOUBLE_BRAQUAGE_' + Date.now();
        const doubleExpiresAt = Date.now() + 5000;
        await db.addRoleExpiration(testDoubleUserId, testRoleId, doubleExpiresAt);

        const roleExpBefore = await db.getRoleExpiration(testDoubleUserId, testRoleId);
        if (roleExpBefore && roleExpBefore.expires_at) {
            console.log('✅ Expiration de rôle enregistrée dans role_expirations (Correct)');
        } else {
            console.error('❌ Expiration de rôle non trouvée dans role_expirations');
        }

        // Nettoyage
        await db.removeRoleExpiration(testDoubleUserId, testRoleId);
        console.log('✅ Nettoyage role_expirations effectué');

        // ═══════════════════════════════════════════
        // RÉSUMÉ
        // ═══════════════════════════════════════════
        console.log('\n════════════════════════════════════════');
        console.log('✨ Tous les tests du module Braquage sont terminés !');
        console.log('════════════════════════════════════════');

    } catch (error) {
        console.error('\n❌ Erreur pendant le test:', error);
    } finally {
        process.exit();
    }
}

testBraquage();
