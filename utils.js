const { EmbedBuilder } = require('discord.js');

const COLORS = {
    PRIMARY: '#2b2d31',
    SUCCESS: '#43b581',
    ERROR: '#f04747',
    GOLD: '#f1c40f',
    VIOLET: '#9b59b6'
};

const CURRENCY = 'coins 🪙';

function createEmbed(title, description, color = COLORS.PRIMARY) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
}

function parseBet(input, currentBalance) {
    const balance = BigInt(currentBalance);
    if (input?.toLowerCase() === 'all') return balance;
    try {
        const bet = BigInt(input);
        if (bet <= 0n) return null;
        return bet;
    } catch (e) {
        return null;
    }
}

function formatCoins(amount, includeEmoji = true) {
    // Handle BigInt or string balance from PG
    const val = BigInt(amount);
    const currencySuffix = includeEmoji ? CURRENCY : 'coins';
    return `**${val.toLocaleString('fr-FR')}** ${currencySuffix}`;
}

const LOG_CHANNEL_ID = '1471509327419543552';

async function sendLog(guild, title, description, color, fields = []) {
    try {
        const channel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .addFields(fields)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error("[Logger] Erreur envoi log:", err.message);
    }
}

async function announceBigWin(client, user, gameName, bet, profit, extraDetails = "") {
    if (profit < 500n) return;

    let title = '🎉 PETIT MAGOT !';
    let color = COLORS.SUCCESS;

    if (profit >= 1000000n) {
        title = '⭐ LE MYTHE DU CASINO ⭐';
        color = '#ffffff'; // Blanc pour le mythe
    } else if (profit >= 100000n) {
        title = '🔥 JACKPOT LÉGENDAIRE !';
        color = '#ff0000'; // Rouge vif
    } else if (profit >= 20000n) {
        title = '💎 JACKPOT ÉPIQUE !';
        color = COLORS.VIOLET;
    } else if (profit >= 5000n) {
        title = '💰 GROS JACKPOT !';
        color = COLORS.GOLD;
    } else if (profit >= 1000n) {
        title = '✨ BEAU GAIN !';
        color = '#3498db'; // Bleu
    }

    try {
        const { WINS_CHANNEL_ID } = require('./roleConfig');
        const channel = await client.channels.fetch(WINS_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const embed = createEmbed(
            title,
            `**${user.username}** vient de gagner à : **${gameName}**\n\n` +
            `🔹 **Mise:** ${formatCoins(bet)}\n` +
            `🔹 **Gain:** ${formatCoins(profit)}\n` +
            (extraDetails ? `\n${extraDetails}` : ''),
            color
        );
        embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
        await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error("[Win Announce] Erreur:", err.message);
    }
}

module.exports = { COLORS, CURRENCY, createEmbed, parseBet, formatCoins, sendLog, announceBigWin };
