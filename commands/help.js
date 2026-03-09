const { createEmbed, COLORS } = require('../utils');

const cooldowns = new Map();

module.exports = {
    name: 'help',
    description: 'Affiche la liste des commandes',
    async execute(message, args, db) {
        // Cooldown anti-spam (5 secondes)
        const now = Date.now();
        const userId = message.author.id;
        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + 5000;
            if (now < expirationTime) return;
        }
        cooldowns.set(userId, now);

        const prefix = process.env.PREFIX || ';';
        const commands = [
            `**👤 Général**`,
            `\`${prefix}bal\` - Voir votre solde`,
            `\`${prefix}profil\` - Voir votre profil`,
            `\`${prefix}leaderboard\` - Top des joueurs`,
            `\`${prefix}daily\` - Récompense quotidienne`,
            `\`${prefix}collect\` - Récupérer des SCoins (30min)`,
            `\`${prefix}gift\` - Donner des SCoins`,
            `\`${prefix}vole\` - Tenter un vol`,
            `✨ \`${prefix}prestige\` - Infos sur le Prestige`,
            `⏫ \`${prefix}reset\` - Monter en Prestige (Reset)`,
            ``,
            `**🎫 Tirages**`,
            `\`${prefix}tirage\` - Tenter votre chance`,
            `\`${prefix}weeklytirages\` - Récupérer vos tickets`,
            ``,
            `**🎮 Jeux de Casino**`,
            `🃏 \`${prefix}bj\` - Blackjack`,
            `🎡 \`${prefix}roulette\` - Roulette`,
            `🪙 \`${prefix}cf\` - Coinflip`,
            `📈 \`${prefix}crash\` - Crash`,
            `💣 \`${prefix}mines\` - Mines (mn)`,
            `🗼 \`${prefix}towers\` - Towers (tw)`,
            ``,
            `**🛠️ Admin**`,
            `\`${prefix}sanction\` | \`${prefix}sanctionsuser\` | \`${prefix}setupcasino\``,
            `\`${prefix}removemoney\` | \`${prefix}addmoney\` | \`${prefix}givetirages\``
        ];

        const embed = createEmbed(
            '📚 Aide - Casino & Prestige',
            commands.join('\n')
        );

        message.reply({ embeds: [embed] });
    }
};
