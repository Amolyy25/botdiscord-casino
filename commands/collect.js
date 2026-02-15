const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'collect',
    description: 'Récupère 150 coins toutes les 30 minutes',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const now = Date.now();
        const cooldown = 30 * 60 * 1000; // 30 minutes

        if (now - parseInt(user.last_collect || 0) < cooldown) {
            const remaining = cooldown - (now - parseInt(user.last_collect || 0));
            const minutes = Math.floor(remaining / (60 * 1000));
            const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
            
            return message.reply({ 
                embeds: [createEmbed('Cooldown', `Revenez dans **${minutes}m ${seconds}s** pour votre collecte.`, COLORS.ERROR)]
            });
        }

        const reward = 150;
        await db.updateBalance(message.author.id, reward);
        await db.updateCollect(message.author.id, now);

        const embed = createEmbed(
            'Collecte Effectuée 💰',
            `Vous avez récupéré ${formatCoins(reward)} !`,
            COLORS.SUCCESS
        );

        message.reply({ embeds: [embed] });
    }
};
