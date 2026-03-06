const { EmbedBuilder } = require("discord.js");
const { createEmbed, COLORS, formatCoins, sendLog } = require("./utils");
const cron = require("node-cron");

// IDs de configuration
const ANNONCE_CHANNEL_ID = "1471224764973449328";
const REPONSE_CHANNEL_ID = "1471225050417070190";
const ROLE_BRAQUAGE_ID = "1470554786502803638";
const ROLE_CASINO_ID = "1469713522194780404";
const BRAQUAGE_REWARD = 250000n;

// Horaires
const HEURE_OUVERTURE = 20;
const MINUTE_OUVERTURE = 30;
const HEURE_FERMETURE = 23;
const MINUTE_FERMETURE = 59;

/**
 * Retourne l'heure actuelle en Europe/Paris de manière fiable.
 */
function getParisTime() {
    const parisFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Paris",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
    });
    const parisParts = parisFormatter.formatToParts(new Date());
    const hourPart = parisParts.find((p) => p.type === "hour");
    const minutePart = parisParts.find((p) => p.type === "minute");

    if (!hourPart || !minutePart) {
        console.error("[Braquage] Impossible de déterminer l'heure de Paris. Parts:", parisParts);
        return { currentHour: null, currentMinute: null };
    }

    return {
        currentHour: parseInt(hourPart.value, 10),
        currentMinute: parseInt(minutePart.value, 10),
    };
}

/**
 * Lance le scénario du braquage : envoie l'énigme, déverrouille le salon, et lance le collecteur.
 * Met à jour le statut en DB vers "active".
 */
async function lancerBraquage({
    annonceChannel,
    reponseChannel,
    guild,
    code,
    embedDescription,
    db,
    braquageId,
}) {
    // Mettre à jour le statut en DB
    if (braquageId) {
        await db.updateBraquageStatus(braquageId, "active");
    }

    // Créer l'embed d'annonce avec l'énigme
    const annonceEmbed = new EmbedBuilder()
        .setTitle("🔫 BRAQUAGE EN COURS !")
        .setDescription(embedDescription)
        .setColor("#FF0000")
        .setThumbnail(
            "https://www.shutterstock.com/image-vector/robbery-thief-character-cartoon-masked-600nw-2677964105.jpg",
        )
        .addFields(
            { name: "💰 Récompense", value: formatCoins(BRAQUAGE_REWARD), inline: true },
            { name: "🎭 Rôle", value: `<@&${ROLE_BRAQUAGE_ID}>`, inline: true },
            { name: "📍 Salon de réponse", value: `<#${REPONSE_CHANNEL_ID}>`, inline: false },
            { name: "⏰ Fermeture", value: "Aujourd'hui à **23h59**", inline: false },
        )
        .setFooter({ text: "Trouvez le code à 4 chiffres pour braquer le coffre !" })
        .setTimestamp();

    // Envoyer l'énigme dans le salon d'annonce
    await annonceChannel.send({ embeds: [annonceEmbed] });

    // Déverrouiller le salon réponse
    await reponseChannel.permissionOverwrites.edit(guild.id, {
        SendMessages: null,
    });

    await reponseChannel.send({
        embeds: [
            createEmbed(
                "🔓 LE COFFRE EST ACCESSIBLE !",
                "**Tapez le code maintenant !**\nLe premier à trouver le bon code remportera le braquage !\n\n⏰ Vous avez jusqu'à **23h59** pour trouver le code !",
                COLORS.SUCCESS,
            ),
        ],
    });

    // Lancer le collecteur
    return startBraquageCollector({
        annonceChannel,
        reponseChannel,
        guild,
        code,
        db,
        braquageId,
    });
}

/**
 * Démarre un collecteur de messages sur le salon réponse.
 * Gère le cron de fermeture à 23h59 et la logique de gain.
 * Peut être appelé au restart du bot pour un braquage déjà "active".
 */
function startBraquageCollector({
    annonceChannel,
    reponseChannel,
    guild,
    code,
    db,
    braquageId,
}) {
    const filter = (msg) => !msg.author.bot;
    const collector = reponseChannel.createMessageCollector({
        filter,
        time: 4 * 60 * 60 * 1000,
    });

    // Programmer la fermeture automatique à 23h59
    const closeCron = cron.schedule(
        "59 23 * * *",
        async () => {
            try {
                await reponseChannel.permissionOverwrites.edit(guild.id, {
                    SendMessages: false,
                });

                await reponseChannel.send({
                    embeds: [
                        createEmbed(
                            "🔒 Temps écoulé !",
                            "Le coffre s'est refermé... Personne n'a trouvé le code cette fois !\nÀ la prochaine !",
                            COLORS.ERROR,
                        ),
                    ],
                });

                collector.stop("timeout");
            } catch (err) {
                console.error("Erreur lors de la fermeture auto du braquage :", err);
            } finally {
                closeCron.stop();
            }
        },
        {
            timezone: "Europe/Paris",
        },
    );

    // Quand le collecteur s'arrête (timeout, winner, ou stop manuel)
    collector.on("end", async (collected, reason) => {
        // Marquer le braquage comme terminé en DB
        if (braquageId) {
            try {
                await db.updateBraquageStatus(braquageId, "closed");
            } catch (err) {
                console.error("[Braquage] Erreur lors de la mise à jour du statut en DB :", err);
            }
        }
        // S'assurer que le cron est bien arrêté
        try { closeCron.stop(); } catch (e) {}
        console.log(`[Braquage] Collecteur arrêté (raison: ${reason}, messages: ${collected.size})`);
    });

    collector.on("collect", async (msg) => {
        if (msg.content.trim() === code) {
            collector.stop("winner_found");
            closeCron.stop();

            const winnerId = msg.author.id;

            try {
                // 1. Ajouter les coins
                await db.updateBalance(winnerId, BRAQUAGE_REWARD);
                await db.incrementGameWin(winnerId, 'braquage');

                // 2. Récupérer le membre
                const member = await guild.members.fetch(winnerId).catch(() => null);

                if (member) {
                    // 3. Rôle Casino si absent
                    if (!member.roles.cache.has(ROLE_CASINO_ID)) {
                        await member.roles.add(ROLE_CASINO_ID).catch(() => {});
                    }
                    // 4. Rôle Braquage
                    await member.roles.add(ROLE_BRAQUAGE_ID).catch(() => {});
                }

                // 5. Enregistrer l'expiration du rôle (7 jours)
                const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
                await db.addBraquageWinner(winnerId, code, BRAQUAGE_REWARD, ROLE_BRAQUAGE_ID, expiresAt);
                await db.addRoleExpiration(winnerId, ROLE_BRAQUAGE_ID, expiresAt, guild.id);

                // LOG
                await sendLog(
                    guild,
                    '🎭 Vainqueur Braquage (Rôle)',
                    `<@${winnerId}> a remporté le braquage et obtenu le rôle <@&${ROLE_BRAQUAGE_ID}> pour **7 jours**.\nCode trouvé : ||${code}||`,
                    COLORS.GOLD
                );

                // 6. Verrouiller le salon
                await reponseChannel.permissionOverwrites.edit(guild.id, {
                    SendMessages: false,
                });

                // 7. Annoncer le gagnant
                const winEmbed = new EmbedBuilder()
                    .setTitle("🎉 BRAQUAGE RÉUSSI !")
                    .setDescription(
                        `<@${winnerId}> a trouvé le code et s'empare du coffre !\n\n` +
                        `💰 **Gain :** ${formatCoins(BRAQUAGE_REWARD)}\n` +
                        `🎭 **Rôle :** <@&${ROLE_BRAQUAGE_ID}> (7 jours)\n\n` +
                        `🔒 Le coffre est désormais verrouillé. À la prochaine !`,
                    )
                    .setColor("#43b581")
                    .setThumbnail(msg.author.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                await reponseChannel.send({ embeds: [winEmbed] });

                // 8. Annoncer dans le salon d'annonce
                const annonceWinEmbed = new EmbedBuilder()
                    .setTitle("🏆 BRAQUAGE TERMINÉ !")
                    .setDescription(
                        `Le coffre a été braqué par <@${winnerId}> !\n\n` +
                        `💰 **Gain :** ${formatCoins(BRAQUAGE_REWARD)}\n` +
                        `🎭 **Rôle obtenu :** <@&${ROLE_BRAQUAGE_ID}>`,
                    )
                    .setColor("#f1c40f")
                    .setTimestamp();

                await annonceChannel.send({ embeds: [annonceWinEmbed] });
            } catch (err) {
                console.error("Erreur lors du traitement du gagnant du braquage :", err);
                await reponseChannel.send({
                    embeds: [
                        createEmbed(
                            "Erreur",
                            "Une erreur est survenue lors de l'attribution des récompenses.",
                            COLORS.ERROR,
                        ),
                    ],
                });
            }
        }
    });

    return collector;
}

module.exports = {
    ANNONCE_CHANNEL_ID,
    REPONSE_CHANNEL_ID,
    ROLE_BRAQUAGE_ID,
    ROLE_CASINO_ID,
    BRAQUAGE_REWARD,
    HEURE_OUVERTURE,
    MINUTE_OUVERTURE,
    HEURE_FERMETURE,
    MINUTE_FERMETURE,
    getParisTime,
    lancerBraquage,
    startBraquageCollector,
};
