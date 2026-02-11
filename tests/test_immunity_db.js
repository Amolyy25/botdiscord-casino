require('dotenv').config({ path: '../.env' });
const db = require('../database');

async function testImmunity() {
    console.log('🧪 Démarrage du test d\'immunité...');
    
    const testUserId = 'TEST_USER_' + Date.now();
    const testRoleId = '1470934040692392008'; // Immunité 2H
    
    try {
        // 1. Tester l'ajout d'une expiration
        console.log('\n1. Test de l\'ajout d\'une expiration...');
        const now = Date.now();
        const expiresAt = now + 5000; // Expire dans 5 secondes pour le test
        
        await db.addRoleExpiration(testUserId, testRoleId, expiresAt);
        console.log(`✅ Expiration ajoutée pour ${testUserId} (expire à ${expiresAt})`);

        // 2. Vérifier que le rôle n'est pas encore expiré
        console.log('\n2. Vérification avant expiration...');
        const expiredBefore = await db.getExpiredRoles(now);
        const isFoundBefore = expiredBefore.some(e => e.user_id === testUserId && e.role_id === testRoleId);
        if (!isFoundBefore) {
            console.log('✅ Le rôle n\'est pas listé comme expiré (Correct)');
        } else {
            console.error('❌ Le rôle est déjà listé comme expiré !');
        }

        // 3. Attendre l'expiration
        console.log('\n3. Attente de 6 secondes pour l\'expiration...');
        await new Promise(resolve => setTimeout(resolve, 6000));

        // 4. Vérifier que le rôle est maintenant expiré
        console.log('\n4. Vérification après expiration...');
        const expiredAfter = await db.getExpiredRoles(Date.now());
        const isFoundAfter = expiredAfter.some(e => e.user_id === testUserId && e.role_id === testRoleId);
        if (isFoundAfter) {
            console.log('✅ Le rôle est maintenant listé comme expiré (Correct)');
        } else {
            console.error('❌ Le rôle n\'est pas listé comme expiré après le délai !');
        }

        // 5. Tester la suppression
        console.log('\n5. Test de la suppression de l\'expiration...');
        await db.removeRoleExpiration(testUserId, testRoleId);
        const expiredFinal = await db.getExpiredRoles(Date.now());
        const isFoundFinal = expiredFinal.some(e => e.user_id === testUserId && e.role_id === testRoleId);
        if (!isFoundFinal) {
            console.log('✅ L\'entrée a été supprimée de la base de données (Correct)');
        } else {
            console.error('❌ L\'entrée est toujours présente après suppression !');
        }

        console.log('\n✨ Tous les tests de base de données pour l\'immunité sont terminés !');
        
    } catch (error) {
        console.error('\n❌ Erreur pendant le test:', error);
    } finally {
        process.exit();
    }
}

testImmunity();
