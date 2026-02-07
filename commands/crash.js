const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');

module.exports = {
    name: 'crash',
    description: 'Jouez au Crash',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const bet = parseBet(args[0], user.balance);

        if (bet === null || bet <= 0n) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;crash [mise/all]\``, COLORS.ERROR)]
            });
        }

        if (BigInt(user.balance) < bet) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Solde insuffisant.`, COLORS.ERROR)]
            });
        }

        // Logic for crash point
        const crashPoint = Math.max(1.1, (100 / (Math.random() * 100)).toFixed(2));
        
        let currentMultiplier = 1.0;
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cashout')
                .setLabel('CASH OUT')
                .setStyle(ButtonStyle.Danger)
        );

        const msg = await message.reply({ 
            embeds: [createEmbed('Crash 📈', `Multiplicateur: **${currentMultiplier.toFixed(2)}x**\n\nCliquez sur le bouton pour encaisser !`)],
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id && i.customId === 'cashout',
            time: 60000 
        });

        let cashedOut = false;
        
        const interval = setInterval(async () => {
            currentMultiplier += 0.1;
            
            if (currentMultiplier >= crashPoint) {
                clearInterval(interval);
                collector.stop();
                if (!cashedOut) {
                    await db.updateBalance(message.author.id, -bet);
                    msg.edit({ 
                        embeds: [createEmbed('CRASHED! 💥', `Le multiplicateur a crashé à **${crashPoint}x**.\n\nVous avez perdu ${formatCoins(bet)}.`, COLORS.ERROR)],
                        components: []
                    }).catch(() => {});
                }
                return;
            }

            msg.edit({ 
                embeds: [createEmbed('Crash 📈', `Multiplicateur: **${currentMultiplier.toFixed(2)}x**\n\nCliquez sur le bouton pour encaisser !`)],
                components: [row]
            }).catch(() => {});

        }, 1000);

        collector.on('collect', async i => {
            if (cashedOut) return;
            cashedOut = true;
            clearInterval(interval);
            collector.stop();

            const total = BigInt(Math.floor(Number(bet) * currentMultiplier));
            const winAmount = total - bet;
            
            await db.updateBalance(message.author.id, winAmount);

            // Announce big wins (500+ coins profit)
            if (winAmount >= 500n) {
                try {
                    const { WINS_CHANNEL_ID } = require('../roleConfig');
                    const winsChannel = await message.client.channels.fetch(WINS_CHANNEL_ID);
                    if (winsChannel) {
                        const winEmbed = createEmbed(
                            '🎉 GROS GAIN AU CRASH !',
                            `**${message.author.username}** vient de gagner ${formatCoins(winAmount)} au Crash !\n\n` +
                            `**Multiplicateur:** ${currentMultiplier.toFixed(2)}x\n` +
                            `**Mise:** ${formatCoins(bet)}\n` +
                            `**Gain total:** ${formatCoins(total)}\n` +
                            `**Profit:** ${formatCoins(winAmount)}`,
                            COLORS.GOLD
                        );
                        winEmbed.setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
                        await winsChannel.send({ embeds: [winEmbed] });
                    }
                } catch (e) {
                    console.error('Failed to send win announcement:', e);
                }
            }

            await i.update({ 
                embeds: [createEmbed('Cashed Out! 💰', `Vous avez retiré à **${currentMultiplier.toFixed(2)}x**.\n\nGains: ${formatCoins(total)} (Profit: ${formatCoins(winAmount)})\n\nLe multiplicateur est finalement monté jusqu'à **${crashPoint}x** !`, COLORS.SUCCESS)],
                components: []
            }).catch(() => {});
        });
    }
};
