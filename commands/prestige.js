const { createEmbed, COLORS, formatCoins } = require('../utils');
const { PRESTIGE_LEVELS } = require('../prestigeConfig');

module.exports = {
    name: 'prestige',
    description: 'Affiche la liste des paliers de prestige et leurs récompenses',
    async execute(message, args, db) {
        let description = "L'ascension vous permet de réinitialiser votre solde en échange de bonus permanents et de rôles exclusifs.\n\n";

        for (const p of PRESTIGE_LEVELS) {
            description += `**${p.name}**\n`;
            description += `Prix : **${formatCoins(p.price, false)}**\n`;
            description += `Rôle : <@&${p.roleId}>\n`;
            description += `Avantages :\n`;
            description += p.rewards.map(r => `• ${r}`).join('\n') + "\n\n";
        }

        description += `*Utilisez la commande \`;reset\` pour passer au palier suivant.*`;

        const embed = createEmbed(
            'Système de Prestige',
            description,
            COLORS.PRIMARY
        );

        message.reply({ embeds: [embed] });
    }
};
