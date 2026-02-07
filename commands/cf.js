const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');

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

        const outcome = Math.random() < 0.5 ? 'pile' : 'face';
        const win = side === outcome;
        const gain = win ? bet : -bet;

        await db.updateBalance(message.author.id, gain);

        // Announce big wins (500+ coins)
        if (win && bet >= 500n) {
            try {
                const { WINS_CHANNEL_ID } = require('../roleConfig');
                const winsChannel = await message.client.channels.fetch(WINS_CHANNEL_ID);
                if (winsChannel) {
                    const winEmbed = createEmbed(
                        '🎉 GROS GAIN AU COINFLIP !',
                        `**${message.author.username}** vient de gagner ${formatCoins(bet)} au Coinflip !\n\n` +
                        `**Résultat:** ${outcome.toUpperCase()}\n` +
                        `**Mise:** ${formatCoins(bet)}\n` +
                        `**Gain:** ${formatCoins(bet)}`,
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
        const embed = createEmbed(
            'Coinflip 🪙',
            `La pièce est tombée sur **${outcome.toUpperCase()}** !\n\n` +
            (win ? `Félicitations ! Vous gagnez ${formatCoins(bet)}.` : `Dommage, vous avez perdu ${formatCoins(bet)}.`),
            embedColor
        );
        
        embed.setFooter({ text: `Mise: ${bet.toLocaleString('fr-FR')} coins` });

        message.reply({ embeds: [embed] });
    }
};
