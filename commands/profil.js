const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');
const { BOOSTER_ROLE_ID, PREMIUM_ROLE_ID } = require('../roleConfig');

module.exports = {
    name: 'profil',
    description: 'Affiche le profil d\'un utilisateur',
    async execute(message, args, db) {
        // Check if user is trying to view someone else's profile
        const isCheckingOthers = args[0] || message.mentions.users.first();
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

        if (isCheckingOthers && !isAdmin) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Seuls les administrateurs peuvent voir le profil des autres joueurs.`, COLORS.ERROR)]
            });
        }

        let targetUser = message.mentions.users.first();
        let targetId = args[0] ? args[0].replace(/[<@!>]/g, '') : message.author.id;

        // If admin is checking someone else
        if (isAdmin && isCheckingOthers) {
            if (!targetUser && targetId) {
                try {
                    targetUser = await message.client.users.fetch(targetId);
                } catch (e) {
                    // Not found
                }
            }
        } else {
            // Regular user checking their own profile
            targetUser = message.author;
            targetId = message.author.id;
        }

        const userData = await db.getUser(targetId);
        const displayName = targetUser ? targetUser.username : targetId;

        // Calculate time since last daily
        const now = Date.now();
        const lastDaily = parseInt(userData.last_daily || 0);
        const dailyCooldown = 24 * 60 * 60 * 1000;
        const dailyReady = (now - lastDaily) >= dailyCooldown;
        
        let dailyStatus;
        if (dailyReady) {
            dailyStatus = '✅ Disponible';
        } else {
            const remaining = dailyCooldown - (now - lastDaily);
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            dailyStatus = `⏳ ${hours}h ${minutes}m`;
        }

        // Calculate time since last vole
        const lastVole = parseInt(userData.last_vole || 0);
        const voleCooldown = 2 * 60 * 60 * 1000;
        const voleReady = (now - lastVole) >= voleCooldown;
        
        let voleStatus;
        if (voleReady) {
            voleStatus = '✅ Disponible';
        } else {
            const remaining = voleCooldown - (now - lastVole);
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            voleStatus = `⏳ ${hours}h ${minutes}m`;
        }

        // Calculate time since last weekly tirage
        const lastWeekly = parseInt(userData.last_weekly_tirage || 0);
        const weekCooldown = 7 * 24 * 60 * 60 * 1000;
        const weeklyReady = (now - lastWeekly) >= weekCooldown;
        
        let weeklyStatus;
        if (weeklyReady) {
            weeklyStatus = '✅ Disponible';
        } else {
            const remaining = weekCooldown - (now - lastWeekly);
            const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
            const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            weeklyStatus = `⏳ ${days}j ${hours}h`;
        }

        // Check for special roles
        let hasBooster = false;
        let hasPremium = false;
        try {
            const member = await message.guild.members.fetch(targetId);
            hasBooster = member.roles.cache.has(BOOSTER_ROLE_ID);
            hasPremium = member.roles.cache.has(PREMIUM_ROLE_ID);
        } catch (e) {
            // Not in guild or can't fetch
        }

        const embed = createEmbed(
            `Profil de ${displayName}`,
            `**Solde:** ${formatCoins(userData.balance)}\n` +
            `**Tirages:** 🎫 **${userData.tirages || 0}**\n` +
            `**Prestige:** ✨ **Niveau ${userData.prestige || 0}**\n\n` +
            `**Récompense quotidienne:** ${dailyStatus}\n` +
            `**Vol:** ${voleStatus}\n` +
            (hasBooster || hasPremium ? `**Tirages hebdomadaires:** ${weeklyStatus}\n` : ''),
            COLORS.PRIMARY
        );

        if (targetUser && targetUser.displayAvatarURL) {
            embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));
        }

        message.reply({ embeds: [embed] });
    }
};
