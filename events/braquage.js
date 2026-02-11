const ROLE_BRAQUAGE_ID = '1470554786502803638';

module.exports = {
    async init(client, db) {
        const checkBraquageExpirations = async () => {
            const now = Date.now();
            const expiredEntries = await db.getExpiredBraquageRoles(now);

            for (const entry of expiredEntries) {
                try {
                    const guild = client.guilds.cache.first();
                    if (!guild) continue;

                    const member = await guild.members.fetch(entry.user_id).catch(() => null);

                    if (member) {
                        // Tenter le retrait du rôle — ne clear l'expiration que si ça réussit
                        try {
                            await member.roles.remove(entry.role_id);
                            console.log(`[Braquage] Rôle braquage retiré de ${member.user.tag} (expiré après 7 jours)`);
                            await db.clearBraquageRoleExpiration(entry.id);
                        } catch (removeErr) {
                            // Ne PAS clear l'expiration : le prochain cycle réessaiera
                            console.error(`[Braquage] Échec du retrait du rôle pour ${member.user.tag}, sera réessayé :`, removeErr.message);
                        }
                    } else {
                        // Membre introuvable (a quitté le serveur) : nettoyer l'entrée
                        console.log(`[Braquage] Membre ${entry.user_id} introuvable, nettoyage de l'expiration`);
                        await db.clearBraquageRoleExpiration(entry.id);
                    }
                } catch (error) {
                    console.error(`[Braquage] Erreur lors du retrait du rôle pour user ${entry.user_id}:`, error);
                }
            }
        };

        // Vérifier au démarrage du bot
        checkBraquageExpirations();

        // Vérifier toutes les 30 minutes
        setInterval(checkBraquageExpirations, 30 * 60 * 1000);

        console.log('[Braquage] Système d\'expiration des rôles initialisé');
    }
};
