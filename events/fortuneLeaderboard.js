/**
 * fortuneLeaderboard.js
 * ─────────────────────
 * Système de classement de richesse dynamique sur 14 jours.
 * - Cron toutes les 60 minutes : édite le message persistant.
 * - Seuls les membres actifs (pari ou message) au cours des 14 derniers jours
 *   apparaissent dans le Top 10.
 * - Style : embed blanc, titre "CLASSEMENT FORTUNE | LE SECTEUR".
 */

const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { logError } = require('../utils');

// ── Formatting helpers ─────────────────────────────────────────────────────────

function formatAmount(bigintOrString) {
    const val = BigInt(bigintOrString);
    return val.toLocaleString('fr-FR');
}

function padRank(n) {
    return String(n).padStart(2, '0');
}

// ── Core refresh logic ─────────────────────────────────────────────────────────

async function buildLeaderboardEmbed(client, db, guildId) {
    const rows = await db.getFortuneLeaderboard(guildId, 10);

    let description;

    if (!rows || rows.length === 0) {
        description =
            '```\n[SECTEUR] Aucun capital enregistré sur les 14 derniers jours.\n```';
    } else {
        // Resolve usernames in parallel
        const entries = await Promise.all(rows.map(async (row, i) => {
            let displayName;
            try {
                const user = client.users.cache.get(row.id)
                    || await client.users.fetch(row.id).catch(() => null);
                displayName = user ? user.username : `<@${row.id}>`;
            } catch {
                displayName = `<@${row.id}>`;
            }
            return { rank: i + 1, displayName, balance: row.balance };
        }));

        const lines = entries.map(({ rank, displayName, balance }) => {
            const isWhale = rank === 1;
            const prefix = isWhale
                ? `◈ 01.`   // Baleine symbol for #1
                : `${padRank(rank)}.`;
            const suffix = isWhale ? '  ◈ BALEINE' : '';
            return `${prefix} ${displayName} — ${formatAmount(balance)} Coins${suffix}`;
        });

        description = '```\n' + lines.join('\n') + '\n```';
    }

    const embed = new EmbedBuilder()
        .setTitle('CLASSEMENT FORTUNE | LE SECTEUR')
        .setDescription(description)
        .setColor('#FFFFFF')
        .setFooter({ text: 'Le capital définit l\'influence. Mis à jour chaque heure.' })
        .setTimestamp();

    return embed;
}

// ── Public API ─────────────────────────────────────────────────────────────────

module.exports = {
    /**
     * Initialise le cron job de mise à jour toutes les 60 minutes.
     * À appeler dans bot.js lors du clientReady.
     */
    init: async (client, db) => {
        console.log('[FortuneLeaderboard] Cron initialisé (toutes les 60 min).');

        // Nettoyage journalier des activités > 14 jours (à 4h du matin)
        cron.schedule('0 4 * * *', async () => {
            try {
                await db.cleanOldActivity();
                console.log('[FortuneLeaderboard] Nettoyage des activités anciennes effectué.');
            } catch (err) {
                await logError(client, err, { filePath: 'events/fortuneLeaderboard.js:cleanOldActivity' });
            }
        }, { timezone: 'Europe/Paris' });

        // Mise à jour du leaderboard toutes les 60 minutes
        cron.schedule('0 * * * *', async () => {
            await module.exports.refreshAllLeaderboards(client, db);
        });

        // Première mise à jour immédiate au démarrage
        await module.exports.refreshAllLeaderboards(client, db);
    },

    /**
     * Rafraîchit tous les leaderboards configurés (multi-guild).
     */
    refreshAllLeaderboards: async (client, db) => {
        try {
            const configs = await db.getAllFortuneLeaderboardConfigs();
            for (const config of configs) {
                try {
                    await module.exports.refreshLeaderboard(client, db, config.guild_id);
                } catch (err) {
                    await logError(client, err, { filePath: `events/fortuneLeaderboard.js:refreshLeaderboard:${config.guild_id}` });
                }
            }
        } catch (err) {
            await logError(client, err, { filePath: 'events/fortuneLeaderboard.js:refreshAllLeaderboards' });
        }
    },

    /**
     * Rafraîchit le leaderboard d'un guild spécifique.
     * @param {Client} client
     * @param {object} db
     * @param {string} guildId
     */
    refreshLeaderboard: async (client, db, guildId) => {
        const config = await db.getFortuneLeaderboardConfig(guildId);
        if (!config) return; // Pas encore configuré

        try {
            const channel = await client.channels.fetch(config.channel_id).catch(() => null);
            if (!channel) {
                console.warn(`[FortuneLeaderboard] Salon introuvable: ${config.channel_id}`);
                return;
            }

            const message = await channel.messages.fetch(config.message_id).catch(() => null);
            if (!message) {
                console.warn(`[FortuneLeaderboard] Message introuvable: ${config.message_id}`);
                return;
            }

            const embed = await buildLeaderboardEmbed(client, db, guildId);
            await message.edit({ embeds: [embed] });
            console.log(`[FortuneLeaderboard] Leaderboard mis à jour — guild ${guildId}`);
        } catch (err) {
            console.error(`[FortuneLeaderboard] Erreur lors de la mise à jour:`, err.message);
        }
    }
};
