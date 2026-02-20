const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');

module.exports = {
    name: 'cf',
    description: 'Jouez au Coinflip',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const bet = parseBet(args[0], user.balance);
        const side = args[1]?.toLowerCase();

        if (bet === null || !side || !['pile', 'face'].includes(side)) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;cf [mise/all] [pile/face]\``, COLORS.ERROR)]
            });
        }

        if (BigInt(user.balance) < bet) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Solde insuffisant.`, COLORS.ERROR)]
            });
        }

        // Deduct bet immediately
        await db.updateBalance(message.author.id, -bet, 'Coinflip: Mise');

        const outcome = Math.random() < 0.5 ? 'pile' : 'face';
        const win = side === outcome;
        let profit = 0n;

        if (win) {
            profit = bet;
            if (eventsManager.isDoubleGainActive()) profit *= 2n;

            // Appliquer Bonus de Prestige
            const { applyPrestigeBonus } = require('../prestigeConfig');
            profit = applyPrestigeBonus(profit, parseInt(user.prestige || 0));

            // Refund bet + gain
            await db.updateBalance(message.author.id, bet + profit, 'Coinflip: Gain');
        }
        // If lost, bet is already deducted

        // Announce big wins
        const { announceBigWin } = require('../utils');
        await announceBigWin(message.client, message.author, 'Coinflip', bet, profit, `**Résultat:** ${outcome.toUpperCase()}`);

        const embedColor = win ? COLORS.SUCCESS : COLORS.ERROR;
        const gloryStatus = eventsManager.getGloryHourStatus();
        const eventIndicator = (gloryStatus.active && win) ? ' (x2) ⚡️' : '';
        let description = `La pièce est tombée sur **${outcome.toUpperCase()}** !\n\n` +
            (win ? `Félicitations ! Vous gagnez ${formatCoins(profit)}${eventIndicator}.` : `Dommage, vous avez perdu ${formatCoins(bet)}.`);
        
        if (gloryStatus.active && win) {
            description = `**${gloryStatus.text}**\n\n` + description;
        }

        const embed = createEmbed(
            'Coinflip 🪙',
            description,
            embedColor
        );
        
        if (win) {
            embed.setFooter({ text: `Mise: ${bet.toLocaleString('fr-FR')} coins | Profit: +${formatCoins(profit)}` });
        } else {
            embed.setFooter({ text: `Mise: ${bet.toLocaleString('fr-FR')} coins` });
        }

        message.reply({ embeds: [embed] });
    }
};
