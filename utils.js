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

function formatCoins(amount) {
    // Handle BigInt or string balance from PG
    const val = BigInt(amount);
    return `**${val.toLocaleString('fr-FR')}** ${CURRENCY}`;
}

module.exports = { COLORS, CURRENCY, createEmbed, parseBet, formatCoins };
