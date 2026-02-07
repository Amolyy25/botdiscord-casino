const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'bal',
    description: 'Affiche votre solde',
    async execute(message, args, db) {
        // Check if user is trying to view someone else's balance
        const isCheckingOthers = args[0] || message.mentions.users.first();
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

        if (isCheckingOthers && !isAdmin) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Seuls les administrateurs peuvent voir le solde des autres joueurs.`, COLORS.ERROR)]
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
            // Regular user checking their own balance
            targetUser = message.author;
            targetId = message.author.id;
        }

        const userData = await db.getUser(targetId);
        const displayName = targetUser ? `**${targetUser.username}**` : `<@${targetId}>`;
        
        const embed = createEmbed(
            'Portefeuille 💰',
            `${displayName} possède ${formatCoins(userData.balance)}`
        );

        message.reply({ embeds: [embed] });
    }
};
