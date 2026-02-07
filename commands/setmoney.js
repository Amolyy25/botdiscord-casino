const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'setmoney',
    description: 'Définit le solde d\'un utilisateur (Admin)',
    async execute(message, args, db) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Permission insuffisante.`, COLORS.ERROR)]
            });
        }

        let target = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        const amount = args[1];

        if (!target && rawId) {
            try {
                target = await message.client.users.fetch(rawId);
            } catch (e) {
                target = { id: rawId, username: rawId };
            }
        }

        if (!target || isNaN(parseInt(amount))) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;setmoney @user/ID [montant]\``, COLORS.ERROR)]
            });
        }

        await db.setBalance(target.id, amount);

        const embed = createEmbed(
            'Admin: Solde défini',
            `Le solde de **${target.username || target.id}** a été défini sur ${formatCoins(amount)}.`,
            COLORS.SUCCESS
        );

        message.reply({ embeds: [embed] });
    }
};
