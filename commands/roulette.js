const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');
const achievementsHelper = require('../helpers/achievementsHelper');

module.exports = {
    name: 'roulette',
    description: 'Jouez à la roulette',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const bet = parseBet(args[0], user.balance);
        const choice = args[1]?.toLowerCase();

        const validChoices = ['rouge', 'noir', 'vert'];
        
        if (bet === null || !choice || !validChoices.includes(choice)) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;roulette [mise/all] [rouge/noir/vert]\``, COLORS.ERROR)]
            });
        }

        if (BigInt(user.balance) < bet) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Solde insuffisant.`, COLORS.ERROR)]
            });
        }

        // Deduct bet immediately
        await db.updateBalance(message.author.id, -bet, 'Roulette: Mise');

        const outcome = Math.floor(Math.random() * 37);
        let resultColor;
        
        if (outcome === 0) resultColor = 'vert';
        else if ([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(outcome)) resultColor = 'rouge';
        else resultColor = 'noir';

        let win = false;
        let gain = 0n;

        if (choice === resultColor) {
            win = true;
            gain = choice === 'vert' ? bet * 35n : bet;
            
            gain = await eventsManager.applyGloryHourMultiplier(message.author.id, gain, db);

            // Appliquer Bonus de Prestige
            const { applyPrestigeBonus } = require('../prestigeConfig');
            gain = applyPrestigeBonus(gain, parseInt(user.prestige || 0));

            // Refund bet + gain
            await db.updateBalance(message.author.id, bet + gain, 'Roulette: Gain');
            await db.incrementGameWin(message.author.id, 'roulette');
        } else {
            gain = -bet;
            // Bet already deducted
        }

        // --- Achievements Engine ---
        const newBal = await db.getUser(message.author.id).then(u => BigInt(u.balance));
        const chance = choice === 'vert' ? (1/37) : (18/37);
        const potWin = choice === 'vert' ? bet * 36n : bet * 2n;

        await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'RISK', {
            bet: bet,
            outcome: win ? 'win' : 'loss',
            winChance: chance,
            potentialWin: potWin,
            isJackpot: false,
            newBalance: newBal
        });
        await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'RESILIENCE', {
            bet: bet,
            outcome: win ? 'win' : 'loss',
            winChance: chance,
            newBalance: newBal
        });
        await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'CAPITAL', {});
        // ---------------------------

        // Announce big wins
        const { announceBigWin } = require('../utils');
        await announceBigWin(message.client, message.author, 'Roulette', bet, gain, 
            `**Couleur:** ${resultColor.toUpperCase()} (${outcome})\n` +
            (choice === 'vert' ? '💎 **VERT x35 !**' : ''));

        const embedColor = win ? COLORS.SUCCESS : COLORS.ERROR;
        const gloryStatus = eventsManager.getGloryHourStatus();
        const eventIndicator = (gloryStatus.active && win) ? ' (x2) ⚡️' : '';
        let description = `La bille s'est arrêtée sur : **${resultColor.toUpperCase()} (${outcome})**\n\n` +
            (win ? `Félicitations ! Vous gagnez ${formatCoins(gain)}${eventIndicator}.` : `Dommage, vous avez perdu ${formatCoins(bet)}.`);
        
        if (gloryStatus.active && win) {
            description = `**${gloryStatus.text}**\n\n` + description;
        }

        const embed = createEmbed(
            'Roulette 🎡',
            description,
            embedColor
        );
        
        if (win) {
            embed.setFooter({ text: `Mise: ${bet.toLocaleString('fr-FR')} coins | Profit: +${formatCoins(gain)}` });
        } else {
            embed.setFooter({ text: `Mise: ${bet.toLocaleString('fr-FR')} coins` });
        }

        message.reply({ embeds: [embed] });
    }
};
