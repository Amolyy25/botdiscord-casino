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
                        try {
                            await member.roles.remove(entry.role_id);
                            console.log(`[RoleExpiration] Role ${entry.role_id} retire de ${member.user.tag}`);
                            await db.removeRoleExpiration(entry.user_id, entry.role_id);
                        } catch (removeErr) {
                            console.error(
                                `[RoleExpiration] Echec retrait role ${entry.role_id} pour ${member.user.tag}, sera reessaye :`,
                                removeErr.message,
                            );
                        }
                    } else {
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

        // ── Startup recovery ──
        try {
            console.log('[RoleExpiration] Demarrage recovery...');

            // 1. Traiter tous les rôles qui ont expiré pendant que le bot était éteint
            await checkExpirations();

            // 2. Lister tous les rôles encore en attente d'expiration
            const allPending = await db.getAllPendingRoleExpirations();

            if (allPending.length > 0) {
                console.log(`[RoleExpiration] ${allPending.length} role(s) temporaire(s) en cours :`);
                for (const entry of allPending) {
                    const remaining = Math.max(0, parseInt(entry.expires_at) - Date.now());
                    const hours = Math.floor(remaining / (60 * 60 * 1000));
                    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
                    console.log(
                        `  - user ${entry.user_id} ・ role ${entry.role_id} ・ expire dans ${hours}h ${minutes}m`,
                    );
                }
            } else {
                console.log('[RoleExpiration] Aucun role temporaire actif');
            }
        } catch (err) {
            console.error('[RoleExpiration] Erreur lors du startup recovery:', err);
        }

        // ── Interval régulier ──
        setInterval(checkExpirations, 2 * 60 * 1000);

        console.log('[RoleExpiration] Systeme initialise ・ check toutes les 2min ・ persistence DB active');
    }
};
