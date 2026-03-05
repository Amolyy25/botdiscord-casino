const { EmbedBuilder } = require('discord.js');

const COLORS = {
    PRIMARY: '#2b2d31',
    SUCCESS: '#43b581',
    ERROR: '#f04747',
    GOLD: '#f1c40f',
    VIOLET: '#9b59b6'
};

const CURRENCY = 'Coins';

function createEmbed(title, description, color = COLORS.PRIMARY) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
}

/**
 * Parses an amount string (like "1.5m", "100k") into BigInt.
 */
function parseAmount(input, currentBalance = 0n) {
    if (input === undefined || input === null) return null;
    const inputStr = input.toString().toLowerCase().trim();
    if (inputStr === 'all') {
        try {
            const balance = BigInt(currentBalance);
            return balance > 0n ? balance : null;
        } catch (e) {
            return null;
        }
    }
    
    // allow things like 1.5m, 1,5k, 2b, 3md
    const strMatch = inputStr.match(/^([\d.,]+)(k|m|md|b)?$/);
    if (!strMatch) {
        try {
            const val = BigInt(inputStr);
            return val >= 0n ? val : null;
        } catch(e) {
            return null;
        }
    }

    let numStr = strMatch[1].replace(',', '.');
    const suffix = strMatch[2];

    if (!suffix) {
        try {
            let [intPart] = numStr.split('.');
            const val = BigInt(intPart);
            return val >= 0n ? val : null;
        } catch(e) {
            return null;
        }
    }

    let [intPart, fracPart] = numStr.split('.');
    if (!fracPart) fracPart = '';
    
    const zeros = suffix === 'k' ? 3 : suffix === 'm' ? 6 : (suffix === 'md' || suffix === 'b') ? 9 : 0;
    
    if (fracPart.length > zeros) {
        fracPart = fracPart.slice(0, zeros);
    } else {
        fracPart = fracPart.padEnd(zeros, '0');
    }
    
    try {
        const total = BigInt(intPart + fracPart);
        return total >= 0n ? total : null;
    } catch(e) {
        return null;
    }
}

const parseBet = parseAmount;

function formatCoins(amount) {
    try {
        const val = BigInt(amount);
        
        if (val >= 1000000000000n) { // >= 1 Trillion
            const str = val.toString();
            const intPart = str.slice(0, -12);
            const decPart = str.slice(-12, -10).padEnd(2, '0');
            return `${intPart}.${decPart}T ${CURRENCY}`;
        }
        
        // Use Intl.NumberFormat for spaces "1 000 000 000"
        return `${new Intl.NumberFormat('fr-FR').format(val)} ${CURRENCY}`;
    } catch (e) {
        return `0 ${CURRENCY}`;
    }
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

async function logError(client, error, context = {}) {
    const { message, interaction, filePath, commandName } = context;
    const ERROR_LOG_CHANNEL_ID = '1471509327419543552';
    
    // 1. Notify the user (if possible)
    const userEmbed = createEmbed(
        "Maintenance Technique 🛠️",
        "Un problème est survenu, l'équipe du secteur a été alertée et va résoudre ce bug le plus rapidement possible. Merci de votre compréhension.",
        COLORS.SUCCESS
    );

    try {
        if (message && message.reply) {
            await message.reply({ embeds: [userEmbed] }).catch(() => {});
        } else if (interaction && (interaction.replied || interaction.deferred)) {
            await interaction.followUp({ embeds: [userEmbed], flags: 64 }).catch(() => {});
        } else if (interaction && interaction.reply) {
            await interaction.reply({ embeds: [userEmbed], flags: 64 }).catch(() => {});
        }
    } catch (e) {
        // Ignore notification errors
    }

    // 2. Log to the dedicated channel
    try {
        const channel = await client.channels.fetch(ERROR_LOG_CHANNEL_ID).catch(() => null);
        if (channel) {
            const executor = (message ? message.author : (interaction ? interaction.user : null));
            const location = (message ? message.channel : (interaction ? interaction.channel : null));
            
            const fields = [
                { name: ' Fichier / Module', value: `\`${filePath || 'Inconnu'}\``, inline: true },
                { name: ' Commande', value: `\`${commandName || 'N/A'}\``, inline: true },
                { name: ' Utilisateur', value: executor ? `<@${executor.id}> (${executor.tag})` : 'Inconnu', inline: true },
                { name: ' Salon', value: location ? `<#${location.id}>` : 'Inconnu', inline: true },
                { name: ' Heure', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            ];

            const errorMsg = error.stack || error.message || String(error);
            // Truncate if too long for embed description
            const description = errorMsg.length > 2000 ? errorMsg.substring(0, 2000) + "..." : errorMsg;

            const logEmbed = new EmbedBuilder()
                .setTitle('⚠️ ALERTE ERREUR SYSTÈME')
                .setDescription(`\`\`\`js\n${description}\n\`\`\``)
                .setColor(COLORS.ERROR)
                .addFields(fields)
                .setTimestamp();

            await channel.send({ embeds: [logEmbed] });
        }
    } catch (err) {
        console.error("[Critical Error Logger] Failed to log error to channel:", err);
    }

    // 3. Always log to console
    console.error(`[ERROR][${filePath || 'Unknown'}]`, error);
}

module.exports = { COLORS, CURRENCY, createEmbed, parseBet, parseAmount, formatCoins, sendLog, announceBigWin, logError };
