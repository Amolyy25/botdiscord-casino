const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'sanctionsuser',
    aliases: ['suser', 'historys'],
    description: 'Affiche l\'historique des sanctions d\'un utilisateur (Mod/Admin)',
    async execute(message, args, db) {
        const MOD_ROLE_ID = "1474736793063657482";
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
        const hasModRole = message.member.roles.cache.has(MOD_ROLE_ID);

        if (!isAdmin && !hasModRole) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Vous n'avez pas la permission d'utiliser cette commande.`, COLORS.ERROR)]
            });
        }

        let targetUser = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;

        if (!targetUser && rawId) {
            try {
                targetUser = await message.client.users.fetch(rawId);
            } catch (e) {}
        }

        if (!targetUser) {
            targetUser = message.author;
        }

        const sanctions = await db.getUserSanctions(targetUser.id);

        if (sanctions.length === 0) {
            return message.reply({ 
                embeds: [createEmbed('Historique des Sanctions', `Aucune sanction enregistrée pour **${targetUser.tag}**.`, COLORS.SUCCESS)]
            });
        }

        const CATEGORIES = {
            cheat: 'Triche / Cheat',
            macro: 'Macro / Autoclick',
            aide: 'Aide à la triche',
            abus: 'Abus de système',
            antifarm: 'Anti-farm / Bypass'
        };

        const SEVERITIES = {
            low: '🔴 Faible',
            medium: '🟠 Moyenne',
            high: '⚫ Haute'
        };

        let description = `Voici l'historique des sanctions pour **${targetUser.tag}** :\n\n`;

        sanctions.forEach((s, index) => {
            const date = new Date(s.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            description += `**#${sanctions.length - index} - ${date}**\n`;
            description += `🔹 **Modérateur :** <@${s.moderator_id}>\n`;
            description += `🔹 **Catégorie :** ${CATEGORIES[s.category] || s.category}\n`;
            description += `🔹 **Gravité :** ${SEVERITIES[s.severity] || s.severity}\n`;
            description += `🔹 **Amende :** ${formatCoins(s.amount)}\n`;
            if (s.mute_time > 0) description += `🔹 **Mute :** ${formatTime(s.mute_time)}\n`;
            if (s.stats_reset) description += `🔹 **Stats :** Réinitialisées ♻️\n`;
            description += `\n`;
        });

        // Limit description length if too many sanctions
        if (description.length > 4096) {
            description = description.substring(0, 4000) + "\n*...liste tronquée car trop longue.*";
        }

        const embed = createEmbed(`Judicature : ${targetUser.username}`, description, COLORS.ERROR);
        message.reply({ embeds: [embed] });
    }
};

function formatTime(ms) {
    if (ms < 3600000) return `${Math.round(ms / 60000)} minutes`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)} heures`;
    return `${Math.round(ms / 86400000)} jours`;
}
