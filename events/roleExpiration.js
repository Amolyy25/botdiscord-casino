module.exports = {
    async init(client, db) {
        const checkExpirations = async () => {
            const now = Date.now();
            const expiredRoles = await db.getExpiredRoles(now);

            for (const entry of expiredRoles) {
                try {
                    const guild = client.guilds.cache.first();
                    if (!guild) continue;

                    const member = await guild.members.fetch(entry.user_id).catch(() => null);

                    if (member) {
                        // Ne supprimer l'entrée DB que si le retrait du rôle réussit
                        try {
                            await member.roles.remove(entry.role_id);
                            console.log(`[RoleExpiration] Role ${entry.role_id} retire de ${member.user.tag}`);
                            await db.removeRoleExpiration(entry.user_id, entry.role_id);
                        } catch (removeErr) {
                            // Ne PAS supprimer l'entrée DB : le prochain cycle réessaiera
                            console.error(
                                `[RoleExpiration] Echec retrait role ${entry.role_id} pour ${member.user.tag}, sera reessaye :`,
                                removeErr.message,
                            );
                        }
                    } else {
                        // Membre introuvable (a quitté le serveur) : nettoyer l'entrée
                        console.log(`[RoleExpiration] Membre ${entry.user_id} introuvable, nettoyage`);
                        await db.removeRoleExpiration(entry.user_id, entry.role_id);
                    }
                } catch (error) {
                    console.error(
                        `[RoleExpiration] Erreur pour user ${entry.user_id}, role ${entry.role_id}:`,
                        error,
                    );
                }
            }
        };

        // Check au démarrage
        checkExpirations();

        // Check toutes les 2 minutes (au lieu de 15min, pour les rôles courts)
        setInterval(checkExpirations, 2 * 60 * 1000);

        console.log('[RoleExpiration] Systeme d\'expiration des roles initialise (check toutes les 2min)');
    }
};
