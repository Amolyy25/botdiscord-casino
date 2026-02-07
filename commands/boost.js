const { createEmbed, COLORS, formatCoins } = require('../utils');
const { BOOSTER_ROLE_ID, PREMIUM_ROLE_ID } = require('../roleConfig');

module.exports = {
    name: 'boost',
    description: 'Récupère une récompense quotidienne pour les rôles Soutien et Booster',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const member = await message.guild.members.fetch(message.author.id);

        const now = Date.now();
        const boostCooldown = 24 * 60 * 60 * 1000; // 24 hours
        const lastBoost = parseInt(user.last_boost || 0);

        if (now - lastBoost < boostCooldown) {
            const remaining = boostCooldown - (now - lastBoost);
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            
            return message.reply({ 
                embeds: [createEmbed('Pas encore disponible ! ⏳', `Vous pourrez récupérer votre boost dans **${hours}h ${minutes}m**.`, COLORS.ERROR)]
            });
        }

        let reward = 0n;
        let rolesFound = [];

        // Check for Soutien (Booster role in config)
        if (member.roles.cache.has(BOOSTER_ROLE_ID)) {
            reward += 100n;
            rolesFound.push('Soutien');
        }

        // Check for Booster (Premium role in config)
        if (member.roles.cache.has(PREMIUM_ROLE_ID)) {
            reward += 300n;
            rolesFound.push('Booster');
        }

        if (reward === 0n) {
            return message.reply({ 
                embeds: [createEmbed('Aucun rôle éligible', `Vous n'avez pas les rôles requis pour cette commande.\n\n**Rôles éligibles :**\n• Soutien : +100 coins\n• Booster : +300 coins`, COLORS.ERROR)]
            });
        }

        await db.updateBalance(message.author.id, reward);
        await db.updateBoost(message.author.id, now);

        const embed = createEmbed(
            'Boost récupéré ! 🚀',
            `Grâce à vos rôles **${rolesFound.join(' et ')}**, vous avez reçu :\n\n` +
            `💰 **+${formatCoins(reward)}**\n\n` +
            `Revenez dans 24h !`,
            COLORS.SUCCESS
        );

        message.reply({ embeds: [embed] });
    }
};
