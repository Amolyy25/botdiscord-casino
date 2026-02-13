module.exports = {
    async init(client, db) {
        const checkExpirations = async () => {
            const now = Date.now();
            const expiredRoles = await db.getExpiredRoles(now);

            for (const entry of expiredRoles) {
                try {
                    let guild;
                    let member;

                    // 1. Essayer de récupérer la guilde via guild_id stocké
                    if (entry.guild_id) {
                        guild = client.guilds.cache.get(entry.guild_id);
                    }

                    // 2. Fallback avec ID spécifique fourni
                    if (!guild) {
                        guild = client.guilds.cache.get('1469071689399926786');
                    }

                    // 2. Fallback : si pas de guild_id (legacy) ou guilde introuvable, essayer de trouver le membre dans toutes les guildes
                    if (!guild) {
                        // On cherche le membre dans toutes les guildes du bot
                        for (const g of client.guilds.cache.values()) {
                            try {
                                const m = await g.members.fetch(entry.user_id).catch(() => null);
                                if (m && m.roles.cache.has(entry.role_id)) {
                                    guild = g;
                                    member = m;
                                    break; 
                                }
                            } catch (e) {}
                        }
                    } else {
                        // Si on a la guilde, on fetch le membre
                        member = await guild.members.fetch(entry.user_id).catch(() => null);
                    }

                    if (member) {
                        try {
                            if (member.roles.cache.has(entry.role_id)) {
                                await member.roles.remove(entry.role_id);
                                console.log(`[RoleExpiration] Role ${entry.role_id} retire de ${member.user.tag} (Guild: ${guild.name})`);
                                
                                // LOG
                                const { sendLog, COLORS } = require('../utils');
                                await sendLog(
                                    guild, 
                                    '⏳ Rôle Expiré',
                                    `Le rôle <@&${entry.role_id}> a été retiré de <@${entry.user_id}> car sa durée est écoulée.`,
                                    COLORS.GOLD
                                );

                            } else {
                                console.log(`[RoleExpiration] Role ${entry.role_id} deja absent de ${member.user.tag}`);
                            }
                            await db.removeRoleExpiration(entry.user_id, entry.role_id);
                        } catch (removeErr) {
                            console.error(
                                `[RoleExpiration] Echec retrait role ${entry.role_id} pour ${member.user.tag}, sera reessaye :`,
                                removeErr.message,
                            );
                        }
                    } else {
                        // Membre introuvable
                        // Si on avait un guild_id mais qu'il n'est plus là, ou si on a checké toutes les guildes sans le trouver
                        console.log(`[RoleExpiration] Membre ${entry.user_id} introuvable (Guild ID: ${entry.guild_id || 'Unknown'}), nettoyage DB`);
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
