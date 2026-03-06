const { createEmbed, COLORS, formatCoins } = require('../utils');
const { PRESTIGE_LEVELS, checkPrestigeRequirements } = require('../prestigeConfig');

const cooldowns = new Map();

module.exports = {
    name: 'prestige',
    description: 'Affiche la liste des paliers de prestige et leurs récompenses, ou vérifie les pré-requis d\'un palier',
    async execute(message, args, db) {
        // Cooldown anti-spam (5 secondes)
        const now = Date.now();
        const userId = message.author.id;
        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + 5000;
            if (now < expirationTime) return;
        }
        cooldowns.set(userId, now);

        if (args[0]) {
            const level = parseInt(args[0]);
            const config = PRESTIGE_LEVELS.find(p => p.level === level);
            if (!config) {
                return message.reply({ embeds: [createEmbed('Erreur', 'Ce niveau de prestige n\'existe pas.', COLORS.ERROR)] });
            }

            const user = await db.getUser(userId);
            const reqs = await checkPrestigeRequirements(level, userId, message.member, db);
            
            // Check balance
            const userBal = BigInt(user.balance);
            const price = BigInt(config.price);
            const balPassed = userBal >= price;
            
            let description = `**Pré-requis pour le ${config.name}**\n\n`;
            description += `${balPassed ? '[Valide]' : '[Refusé]'} Solde : ${formatCoins(userBal, false)} / ${formatCoins(price, false)}\n`;
            
            for (const req of reqs.details) {
                description += `${req.passed ? '[Valide]' : '[Refusé]'} ${req.name} : ${req.text}\n`;
            }

            if (!reqs.hasRequirements || !balPassed) {
                description += `\n*Vous ne remplissez pas encore toutes les conditions pour passer à ce prestige.*`;
            } else {
                description += `\n*Vous remplissez toutes les conditions ! Utilisez \`;reset\` pour procéder.*`;
            }

            const embed = createEmbed(`Conditions : ${config.name}`, description, COLORS.PRIMARY);
            return message.reply({ embeds: [embed] });
        } else {
            let description = "L'ascension vous permet de réinitialiser votre solde en échange de bonus permanents et de rôles exclusifs.\n\n";

            for (const p of PRESTIGE_LEVELS) {
                description += `✨ **${p.name}**\n`;
                description += `💰 Prix : **${formatCoins(p.price, false)}**\n`;
                description += `🛡️ Rôle : <@&${p.roleId}>\n`;
                description += `🎁 Avantages :\n`;
                description += p.rewards.map(r => `• ${r}`).join('\n') + "\n\n";
            }

            description += `*Utilisez la commande \`;prestige [niveau]\` pour voir vos pré-requis, ou \`;reset\` pour ascensionner.*`;

            const embed = createEmbed(
                '🏆 Système de Prestige',
                description,
                COLORS.PRIMARY
            );

            return message.reply({ embeds: [embed] });
        }
    }
};
