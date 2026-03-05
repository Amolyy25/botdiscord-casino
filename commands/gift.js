const { createEmbed, COLORS, formatCoins, parseAmount } = require('../utils');
const achievementsHelper = require('../helpers/achievementsHelper');

module.exports = {
    name: 'gift',
    description: 'Donne des coins à un autre utilisateur',
    async execute(message, args, db) {
        let target = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        const amount = parseAmount(args[1]);

        if (!target && rawId) {
            try {
                target = await message.client.users.fetch(rawId);
            } catch (e) {}
        }

        if (!target || amount === null) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;gift @user/ID [montant]\``, COLORS.ERROR)]
            });
        }

        if (target.id === message.author.id) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Vous ne pouvez pas vous donner de l'argent à vous-même.`, COLORS.ERROR)]
            });
        }

        const sender = await db.getUser(message.author.id);
        if (BigInt(sender.balance) < amount) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Solde insuffisant. Vous n'avez que ${formatCoins(sender.balance)}.`, COLORS.ERROR)]
            });
        }

        await db.updateBalance(message.author.id, -amount, 'Gift: Envoi');
        await db.updateBalance(target.id, amount, 'Gift: Reçu');

        // --- Achievements Engine ---
        await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'SOCIAL', {
            action: 'send',
            amount: amount,
            targetId: target.id
        });
        await achievementsHelper.triggerEvent(message.client, db, target.id, 'SOCIAL', {
            action: 'receive',
            amount: amount,
            targetId: message.author.id
        });
        await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'CAPITAL', {});
        await achievementsHelper.triggerEvent(message.client, db, target.id, 'CAPITAL', {});
        // ---------------------------

        const embed = createEmbed(
            'Transfert réussi 🎁',
            `Vous avez donné ${formatCoins(amount)} à **${target.username}**.`,
            COLORS.SUCCESS
        );

        message.reply({ embeds: [embed] });
    }
};
