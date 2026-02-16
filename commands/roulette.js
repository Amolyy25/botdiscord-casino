const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');

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
        await db.updateBalance(message.author.id, -bet);

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
            
            if (eventsManager.isDoubleGainActive()) {
                gain *= 2n;
            }

            // Refund bet + gain
            await db.updateBalance(message.author.id, bet + gain);
        } else {
            gain = -bet;
            // Bet already deducted
        }

        // Announce big wins (500+ coins)
        if (win && gain >= 500n) {
            try {
                const { WINS_CHANNEL_ID } = require('../roleConfig');
                const winsChannel = await message.client.channels.fetch(WINS_CHANNEL_ID);
                if (winsChannel) {
                    const winEmbed = createEmbed(
                        '🎉 GROS GAIN À LA ROULETTE !',
                        `**${message.author.username}** vient de gagner ${formatCoins(gain)} à la Roulette !\n\n` +
                        `**Couleur:** ${resultColor.toUpperCase()} (${outcome})\n` +
                        `**Mise:** ${formatCoins(bet)}\n` +
                        `**Gain:** ${formatCoins(gain)}` +
                        (choice === 'vert' ? '\n💎 **VERT x35 !**' : ''),
                        COLORS.GOLD
                    );
                    winEmbed.setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
                    await winsChannel.send({ embeds: [winEmbed] });
                }
            } catch (e) {
                console.error('Failed to send win announcement:', e);
            }
        }

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
        
        embed.setFooter({ text: `Mise: ${bet.toLocaleString('fr-FR')} coins` });

        message.reply({ embeds: [embed] });
    }
};
