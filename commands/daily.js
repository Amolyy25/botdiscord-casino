const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'daily',
    description: 'Récupère votre récompense quotidienne',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;

        if (now - parseInt(user.last_daily) < cooldown) {
            const remaining = cooldown - (now - parseInt(user.last_daily));
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            
            return message.reply({ 
                embeds: [createEmbed('Cooldown', `Revenez dans **${hours}h ${minutes}m** pour votre récompense.`, COLORS.ERROR)]
            });
        }

        const reward = 500;
        await db.updateBalance(message.author.id, reward);
        await db.updateDaily(message.author.id, now);

        const embed = createEmbed(
            'Récompense Quotidienne',
            `Vous avez reçu ${formatCoins(reward)} !`,
            COLORS.SUCCESS
        );

        message.reply({ embeds: [embed] });
    }
};
