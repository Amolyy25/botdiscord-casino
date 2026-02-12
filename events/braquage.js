const cron = require('node-cron');
const { createEmbed, COLORS } = require('../utils');
const {
    ANNONCE_CHANNEL_ID,
    REPONSE_CHANNEL_ID,
    HEURE_OUVERTURE,
    MINUTE_OUVERTURE,
    HEURE_FERMETURE,
    MINUTE_FERMETURE,
    getParisTime,
    lancerBraquage,
    startBraquageCollector,
} = require('../braquageUtils');

module.exports = {
    async init(client, db) {
        // ── 1. Système d'expiration des rôles braquage (7 jours) ──
        const checkBraquageExpirations = async () => {
            const now = Date.now();
            const expiredEntries = await db.getExpiredBraquageRoles(now);

            for (const entry of expiredEntries) {
                try {
                    const guild = client.guilds.cache.first();
                    if (!guild) continue;

                    const member = await guild.members.fetch(entry.user_id).catch(() => null);

                    if (member) {
                        try {
                            await member.roles.remove(entry.role_id);
                            console.log(`[Braquage] Rôle braquage retiré de ${member.user.tag} (expiré après 7 jours)`);
                            await db.clearBraquageRoleExpiration(entry.id);
                        } catch (removeErr) {
                            console.error(`[Braquage] Échec du retrait du rôle pour ${member.user.tag}, sera réessayé :`, removeErr.message);
                        }
                    } else {
                        console.log(`[Braquage] Membre ${entry.user_id} introuvable, nettoyage de l'expiration`);
                        await db.clearBraquageRoleExpiration(entry.id);
                    }
                } catch (error) {
                    console.error(`[Braquage] Erreur lors du retrait du rôle pour user ${entry.user_id}:`, error);
                }
            }
        };

        checkBraquageExpirations();
        setInterval(checkBraquageExpirations, 30 * 60 * 1000);
        console.log('[Braquage] Système d\'expiration des rôles initialisé');

        // ── 2. Restauration d'un braquage actif après restart ──
        try {
            const activeBraquage = await db.getActiveBraquage();
            if (!activeBraquage) {
                console.log('[Braquage] Aucun braquage actif à restaurer');
                return;
            }

            const guild = client.guilds.cache.get(activeBraquage.guild_id) || client.guilds.cache.first();
            if (!guild) {
                console.error('[Braquage] Aucun serveur trouvé pour restaurer le braquage');
                await db.updateBraquageStatus(activeBraquage.id, 'closed');
                return;
            }

            const annonceChannel = await guild.channels.fetch(ANNONCE_CHANNEL_ID).catch(() => null);
            const reponseChannel = await guild.channels.fetch(REPONSE_CHANNEL_ID).catch(() => null);

            if (!annonceChannel || !reponseChannel) {
                console.error('[Braquage] Salons introuvables, fermeture du braquage');
                await db.updateBraquageStatus(activeBraquage.id, 'closed');
                return;
            }

            const { currentHour, currentMinute } = getParisTime();
            if (currentHour === null || currentMinute === null) {
                console.error('[Braquage] Impossible de déterminer l\'heure, fermeture du braquage');
                await db.updateBraquageStatus(activeBraquage.id, 'closed');
                return;
            }

            const currentTimeInMinutes = currentHour * 60 + currentMinute;
            const ouvertureInMinutes = HEURE_OUVERTURE * 60 + MINUTE_OUVERTURE;
            const fermetureInMinutes = HEURE_FERMETURE * 60 + MINUTE_FERMETURE;

            // Vérifier si on est dans le créneau du même jour
            // (Si le braquage date d'hier ou avant, on le ferme)
            const braquageDate = new Date(activeBraquage.created_at);
            const now = new Date();
            const braquageDateStr = braquageDate.toISOString().slice(0, 10);
            const todayStr = now.toISOString().slice(0, 10);

            if (braquageDateStr !== todayStr) {
                // Le braquage date d'un autre jour — le fermer
                console.log(`[Braquage] Braquage #${activeBraquage.id} date de ${braquageDateStr}, fermeture`);
                await db.updateBraquageStatus(activeBraquage.id, 'closed');

                // Verrouiller le salon au cas où
                await reponseChannel.permissionOverwrites.edit(guild.id, {
                    SendMessages: false,
                }).catch(() => {});

                return;
            }

            // Même jour — vérifier le statut et l'heure
            if (currentTimeInMinutes >= fermetureInMinutes) {
                // Il est 23h59 ou plus — fermer
                console.log(`[Braquage] Braquage #${activeBraquage.id} : il est trop tard (${currentHour}:${currentMinute}), fermeture`);
                await db.updateBraquageStatus(activeBraquage.id, 'closed');

                await reponseChannel.permissionOverwrites.edit(guild.id, {
                    SendMessages: false,
                }).catch(() => {});

                await reponseChannel.send({
                    embeds: [createEmbed(
                        '🔒 Braquage terminé',
                        'Le bot a redémarré et le braquage est terminé. Le coffre est verrouillé.',
                        COLORS.ERROR,
                    )],
                }).catch(() => {});

                return;
            }

            if (activeBraquage.status === 'pending') {
                // Le braquage est en attente de 20h30
                if (currentTimeInMinutes >= ouvertureInMinutes) {
                    // Il est passé 20h30 — lancer immédiatement
                    console.log(`[Braquage] Restauration braquage #${activeBraquage.id} : pending mais passé 20h30, lancement immédiat`);

                    await lancerBraquage({
                        annonceChannel,
                        reponseChannel,
                        guild,
                        code: activeBraquage.code,
                        embedDescription: activeBraquage.embed_description,
                        db,
                        braquageId: activeBraquage.id,
                    });

                    console.log(`[Braquage] Braquage #${activeBraquage.id} restauré et lancé`);
                } else {
                    // Pas encore 20h30 — reprogrammer le cron
                    console.log(`[Braquage] Restauration braquage #${activeBraquage.id} : pending, reprogrammation cron 20h30`);

                    const openCron = cron.schedule(
                        '30 20 * * *',
                        async () => {
                            try {
                                await lancerBraquage({
                                    annonceChannel,
                                    reponseChannel,
                                    guild,
                                    code: activeBraquage.code,
                                    embedDescription: activeBraquage.embed_description,
                                    db,
                                    braquageId: activeBraquage.id,
                                });
                                console.log(`[Braquage] Braquage #${activeBraquage.id} lancé par cron restauré`);
                            } catch (err) {
                                console.error('[Braquage] Erreur lors du lancement cron restauré :', err);
                            } finally {
                                openCron.stop();
                            }
                        },
                        { timezone: 'Europe/Paris' },
                    );

                    console.log(`[Braquage] Cron 20h30 reprogrammé pour braquage #${activeBraquage.id}`);
                }
            } else if (activeBraquage.status === 'active') {
                // Le braquage était actif — relancer le collecteur
                console.log(`[Braquage] Restauration braquage #${activeBraquage.id} : actif, relance du collecteur`);

                // S'assurer que le salon est ouvert
                await reponseChannel.permissionOverwrites.edit(guild.id, {
                    SendMessages: null,
                }).catch(() => {});

                await reponseChannel.send({
                    embeds: [createEmbed(
                        '🔄 Braquage restauré !',
                        '**Le bot a redémarré mais le braquage continue !**\nTapez le code pour braquer le coffre !\n\n⏰ Vous avez jusqu\'à **23h59** !',
                        COLORS.SUCCESS,
                    )],
                }).catch(() => {});

                startBraquageCollector({
                    annonceChannel,
                    reponseChannel,
                    guild,
                    code: activeBraquage.code,
                    db,
                    braquageId: activeBraquage.id,
                });

                console.log(`[Braquage] Collecteur relancé pour braquage #${activeBraquage.id}`);
            }
        } catch (err) {
            console.error('[Braquage] Erreur lors de la restauration du braquage actif :', err);
        }
    }
};
