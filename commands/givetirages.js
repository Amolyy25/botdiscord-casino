const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS } = require('../utils');

module.exports = {
    name: 'givetirages',
    description: 'Donne des tirages à un utilisateur (Admin)',
    async execute(message, args, db) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Permission insuffisante.`, COLORS.ERROR)]
            });
        }

        let target = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        const amount = parseInt(args[1]);

        if (!target && rawId) {
            try {
                target = await message.client.users.fetch(rawId);
            } catch (e) {
                target = { id: rawId, username: rawId };
            }
        }

        if (!target || isNaN(amount) || amount <= 0) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;givetirages @user/ID [nombre]\``, COLORS.ERROR)]
            });
        }

        const newTotal = await db.updateTirages(target.id, amount);

        const embed = createEmbed(
            'Admin: Tirages ajoutés 🎫',
            `**${amount}** tirage(s) ont été ajoutés à **${target.username || target.id}**.\n\nTotal: **${newTotal}** tirages`,
            COLORS.SUCCESS
        );

        message.reply({ embeds: [embed] });
    }
};
