const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');

const activeGames = new Set();

module.exports = {
    name: 'crash',
    description: 'Jouez au Crash',
    async execute(message, args, db) {
        if (activeGames.has(message.author.id)) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Vous avez déjà une partie de Crash en cours !`, COLORS.ERROR)]
            });
        }

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

        activeGames.add(message.author.id);

        // Logic for crash point
        const crashPoint = Math.max(1.1, (100 / (Math.random() * 100)).toFixed(2));
        
        let currentMultiplier = 1.0;
        let cashedOut = false;
        
        const customId = `crash_cashout_${message.id}`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(customId)
                .setLabel('CASH OUT')
                .setStyle(ButtonStyle.Danger)
        );

        const getEmbed = (status, multiplier, profit = 0n) => {
            const gloryStatus = eventsManager.getGloryHourStatus();
            let desc = `Multiplicateur: **${multiplier}x**\n\n`;
            
            if (status === 'playing') {
                desc += `Cliquez sur le bouton pour encaisser !`;
            } else if (status === 'crashed') {
                desc = `Le multiplicateur a crashé à **${crashPoint}x**.\n\nVous avez perdu ${formatCoins(bet)}.`;
            } else if (status === 'cashed') {
                desc = `Vous avez retiré à **${multiplier}x**.\n\nGains: ${formatCoins(profit + bet)} (Profit: ${formatCoins(profit)})\n\nLe multiplicateur est finalement monté jusqu'à **${crashPoint}x** !`;
            }

            if (gloryStatus.active && status !== 'crashed') {
                desc = `**${gloryStatus.text}**\n\n` + desc;
            }

            const color = status === 'playing' ? COLORS.PRIMARY 
                        : status === 'crashed' ? COLORS.ERROR 
                        : COLORS.SUCCESS;

            return createEmbed(
                status === 'playing' ? 'Crash 📈' : (status === 'crashed' ? 'CRASHED! 💥' : 'Cashed Out! 💰'),
                desc,
                color
            );
        };

        const msg = await message.reply({ 
            embeds: [getEmbed('playing', currentMultiplier.toFixed(2))],
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id && i.customId === customId,
            time: 60000 
        });

        const interval = setInterval(async () => {
            if (cashedOut) {
                clearInterval(interval);
                return;
            }

            currentMultiplier += 0.1;
            
            if (currentMultiplier >= crashPoint) {
                clearInterval(interval);
                collector.stop();
                
                if (!cashedOut) {
                    activeGames.delete(message.author.id);
                    await db.updateBalance(message.author.id, -bet);
                    msg.edit({ 
                        embeds: [getEmbed('crashed', crashPoint)],
                        components: []
                    }).catch(() => {});
                }
                return;
            }

            msg.edit({ 
                embeds: [getEmbed('playing', currentMultiplier.toFixed(2))],
                components: [row]
            }).catch(() => {});

        }, 1000);

        collector.on('collect', async i => {
            if (cashedOut) return;
            cashedOut = true;
            clearInterval(interval);
            collector.stop();
            activeGames.delete(message.author.id);

            const total = BigInt(Math.floor(Number(bet) * currentMultiplier));
            let winAmount = total - bet;
            
            if (eventsManager.isDoubleGainActive()) {
                winAmount *= 2n;
            }

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
                embeds: [getEmbed('cashed', currentMultiplier.toFixed(2), winAmount)],
                components: []
            }).catch(() => {});
        });
    }
};
