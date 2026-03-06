const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'taxe',
    aliases: ['tax'],
    description: 'Taxe une partie des richesses d\'un autre joueur (Prestige VII+)',
    async execute(message, args, db) {
        try {
            // 1. Check User Level
            const user = await db.getUser(message.author.id);
            const userPrestige = parseInt(user.prestige || 0);

            if (userPrestige < 7) {
                return message.reply({ 
                    embeds: [createEmbed('Accès Refusé', 'La commande `;taxe` est réservée aux joueurs de **Prestige VII** et supérieur.', COLORS.ERROR)]
                });
            }

            // 2. Cooldown check (24h)
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;
            const lastUsed = parseInt(user.last_tax_used || 0);

            if (now - lastUsed < cooldown) {
                const remaining = cooldown - (now - lastUsed);
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                return message.reply({ 
                    embeds: [createEmbed('En récupération', `Vous êtes fatigué. Vous pourrez taxer à nouveau dans **${hours}h ${minutes}m**.`, COLORS.ERROR)]
                });
            }

            // 3. Target verification
            const target = message.mentions.users.first();
            if (!target) {
                return message.reply({ 
                    embeds: [createEmbed('Erreur', 'Vous devez mentionner la victime à taxer.\nExemple : `;taxe @joueur`', COLORS.ERROR)]
                });
            }

            if (target.id === message.author.id) {
                return message.reply({
                    embeds: [createEmbed('Erreur', 'Vous ne pouvez pas vous taxer vous-même !', COLORS.ERROR)]
                });
            }

            if (target.bot) {
                return message.reply({
                    embeds: [createEmbed('Erreur', 'Vous ne pouvez pas taxer un bot !', COLORS.ERROR)]
                });
            }

            const targetData = await db.getUser(target.id);
            const targetPrestige = parseInt(targetData.prestige || 0);

            if (targetPrestige >= userPrestige) {
                return message.reply({
                    embeds: [createEmbed('Cible Protégée', `Vous ne pouvez pas taxer un joueur qui a un prestige égal ou supérieur au vôtre (**Prestige ${targetPrestige}**).`, COLORS.ERROR)]
                });
            }

            const targetBalance = BigInt(targetData.balance);
            if (targetBalance <= 0n) {
                return message.reply({
                    embeds: [createEmbed('Cible Pauvre', 'Ce joueur n\'a aucun coin à taxer.', COLORS.ERROR)]
                });
            }

            // 4. Calculate Tax
            let percent = 0n;
            if (userPrestige === 7) percent = 3n;
            if (userPrestige >= 8) percent = 4n;

            const taxAmount = (targetBalance * percent) / 100n;

            if (taxAmount <= 0n) {
                return message.reply({
                    embeds: [createEmbed('Taxe Dérisoire', 'Le montant à taxer est trop faible.', COLORS.ERROR)]
                });
            }

            // 5. Apply Tax
            await db.updateBalance(target.id, -taxAmount, 'Taxe Subie');
            await db.updateBalance(message.author.id, taxAmount, 'Taxe Perçue');
            await db.updateTaxeDate(message.author.id, now);

            // 6. Response Embed
            const successEmbed = createEmbed(
                '💸 Taxe Prélevée !',
                `Au nom de votre suprématie, vous avez imposé une taxe de **${percent}%** à <@${target.id}> !\n\n` +
                `**Butin :** ${formatCoins(taxAmount, false)}`,
                COLORS.SUCCESS
            );

            message.reply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('[Tax Command Error]', error);
            message.channel.send(`❌ Erreur technique dans ;taxe : \`${error.message}\``).catch(() => {});
        }
    }
};
