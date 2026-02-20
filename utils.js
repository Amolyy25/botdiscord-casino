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

module.exports = { COLORS, CURRENCY, createEmbed, parseBet, formatCoins, sendLog };
