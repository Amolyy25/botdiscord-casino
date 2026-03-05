const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS, formatCoins, parseAmount } = require('../utils');

module.exports = {
    name: 'removemoney',
    description: 'Retire des coins à un utilisateur (Admin)',
    async execute(message, args, db) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Permission insuffisante.`, COLORS.ERROR)]
            });
        }

        let target = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        const amount = parseAmount(args[1]);

        if (!target && rawId) {
            try {
                target = await message.client.users.fetch(rawId);
            } catch (e) {
                target = { id: rawId, username: rawId };
            }
        }

        if (!target || amount === null) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;removemoney @user/ID [montant]\``, COLORS.ERROR)]
            });
        }

        await db.updateBalance(target.id, -amount, 'Admin: Retrait');

        const embed = createEmbed(
            'Admin: Retrait de coins',
            `${formatCoins(amount)} ont été retirés du compte de **${target.username || target.id}**.`,
            COLORS.SUCCESS
        );

        message.reply({ embeds: [embed] });
    }
};
