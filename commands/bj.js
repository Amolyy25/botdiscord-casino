const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');
const achievementsHelper = require('../helpers/achievementsHelper');

module.exports = {
    name: 'bj',
    description: 'Jouez au Blackjack',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const bet = parseBet(args[0], user.balance);

        if (bet === null || bet <= 0n) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;bj [mise/all]\``, COLORS.ERROR)]
            });
        }

        if (BigInt(user.balance) < bet) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Solde insuffisant.`, COLORS.ERROR)]
            });
        }

        // Deduct bet immediately to prevent exploits
        await db.updateBalance(message.author.id, -bet, 'Blackjack: Mise');

        const deck = createDeck();
        const playerHand = [drawCard(deck), drawCard(deck)];
        const dealerHand = [drawCard(deck), drawCard(deck)];

        const getHandValue = (hand) => {
            let value = 0;
            let aces = 0;
            for (const card of hand) {
                if (card.rank === 'A') aces++;
                value += card.value;
            }
            while (value > 21 && aces > 0) {
                value -= 10;
                aces--;
            }
            return value;
        };

        const formatCard = (card) => {
            const suitEmojis = {
                '♠': '♠️',
                '♥': '♥️',
                '♦': '♦️',
                '♣': '♣️'
            };
            return `\`${card.rank}${suitEmojis[card.suit] || card.suit}\``;
        };

        const formatHand = (hand, hideSecond = false) => {
            return hand.map((card, i) => {
                if (hideSecond && i === 1) return '`🂠`';
                return formatCard(card);
            }).join(' ');
        };

        const renderEmbed = (status = 'En cours...', gain = 0n) => {
            const playerVal = getHandValue(playerHand);
            const dealerVal = status === 'En cours...' ? '?' : getHandValue(dealerHand);
            const gloryStatus = eventsManager.getGloryHourStatus();
            
            let color = COLORS.PRIMARY;
            let statusEmoji = '🎲';
            
            if (status.includes('Gagné')) {
                color = COLORS.SUCCESS;
                statusEmoji = '🎉';
            } else if (status.includes('Perdu')) {
                color = COLORS.ERROR;
                statusEmoji = '💥';
            } else if (status.includes('Égalité')) {
                color = COLORS.GOLD;
                statusEmoji = '🤝';
            }

            let description = '';
            if (gloryStatus.active && !status.includes('Perdu')) {
                description += `**${gloryStatus.text}**\n\n`;
            }

            description += `╔═══════════════════════════╗\n`;
            description += `║  **CROUPIER**\n`;
            description += `║  ${formatHand(dealerHand, status === 'En cours...')}\n`;
            description += `║  Total: **${dealerVal}**\n`;
            description += `╠═══════════════════════════╣\n`;
            description += `║  **VOUS**\n`;
            description += `║  ${formatHand(playerHand)}\n`;
            description += `║  Total: **${playerVal}**\n`;
            description += `╚═══════════════════════════╝\n\n`;
            description += `${statusEmoji} **${status}**`;

            const embed = createEmbed('🃏 Blackjack', description, color);
            
            let footerText = `Mise: ${bet.toLocaleString('fr-FR')} coins`;
            if (status.includes('Gagné') && gain > 0n) {
                const eventIndicator = gloryStatus.active ? ' (x2) ⚡️' : '';
                footerText += ` | Profit: +${formatCoins(gain)}${eventIndicator}`;
            } else if (status.includes('Perdu')) {
                footerText += ` | Perte: -${bet.toLocaleString('fr-FR')} coins`;
            }
            
            embed.setFooter({ text: footerText });
            return embed;
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('hit')
                .setLabel('🎯 Tirer')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🃏'),
            new ButtonBuilder()
                .setCustomId('stand')
                .setLabel('✋ Rester')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🛑')
        );

        const gameMsg = await message.reply({ 
            embeds: [renderEmbed()],
            components: [row]
        });

        const collector = gameMsg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id,
            time: 60000 
        });

        collector.on('collect', async i => {
            if (i.customId === 'hit') {
                playerHand.push(drawCard(deck));
                if (getHandValue(playerHand) > 21) {
                    // Bet already deducted, just show loss
                    await i.update({ embeds: [renderEmbed('Perdu (Buste)')], components: [] });
                    collector.stop();
                } else {
                    await i.update({ embeds: [renderEmbed()], components: [row] });
                }
            } else if (i.customId === 'stand') {
                while (getHandValue(dealerHand) < 17) {
                    dealerHand.push(drawCard(deck));
                }

                const playerVal = getHandValue(playerHand);
                const dealerVal = getHandValue(dealerHand);

                let result;
                let finalGain = 0n;
                if (dealerVal > 21 || playerVal > dealerVal) {
                    let winAmount = bet;
                    winAmount = await eventsManager.applyGloryHourMultiplier(message.author.id, winAmount, db);

                    result = 'Gagné !' + (eventsManager.isDoubleGainActive() ? ' (Double Gain! ⚡)' : '');
                    
                    // Appliquer Bonus de Prestige
                    const { applyPrestigeBonus } = require('../prestigeConfig');
                    winAmount = applyPrestigeBonus(winAmount, parseInt(user.prestige || 0));
                    
                    finalGain = winAmount;

                    // Refund bet + win amount
                    await db.updateBalance(message.author.id, bet + winAmount, 'Blackjack: Gain');
                    await db.incrementGameWin(message.author.id, 'blackjack');
                } else if (playerVal < dealerVal) {
                    result = 'Perdu';
                    finalGain = -bet;
                    // Bet already deducted
                } else {
                    result = 'Égalité (Push)';
                    // Refund bet
                    await db.updateBalance(message.author.id, bet, 'Blackjack: Égalité');
                }

                // --- Achievements Engine ---
                const newBal = await db.getUser(message.author.id).then(u => BigInt(u.balance));
                await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'RISK', {
                    bet: bet,
                    outcome: (dealerVal > 21 || playerVal > dealerVal) ? 'win' : 'loss',
                    winChance: 0.48, // typical blackjack odds approx
                    potentialWin: bet * 2n,
                    isJackpot: false,
                    newBalance: newBal
                });
                await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'RESILIENCE', {
                    bet: bet,
                    outcome: (dealerVal > 21 || playerVal > dealerVal) ? 'win' : 'loss',
                    winChance: 0.48,
                    newBalance: newBal
                });
                await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'CAPITAL', {});
                // ---------------------------

                await i.update({ embeds: [renderEmbed(result, finalGain)], components: [] });
                collector.stop();

                // Announce big wins
                if (dealerVal > 21 || playerVal > dealerVal) {
                    const { announceBigWin } = require('../utils');
                    await announceBigWin(message.client, message.author, 'Blackjack', bet, finalGain, `**Main:** ${playerVal} vs ${dealerVal}\n**Résultat:** ${result}`);
                }
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                gameMsg.edit({ 
                    embeds: [renderEmbed('Temps écoulé ⏱️')],
                    components: [] 
                }).catch(() => {});
            }
        });
    }
};

function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (const suit of suits) {
        for (const rank of ranks) {
            let value = parseInt(rank);
            if (['J', 'Q', 'K'].includes(rank)) value = 10;
            if (rank === 'A') value = 11;
            deck.push({ rank, suit, value });
        }
    }
    return deck;
}

function drawCard(deck) {
    const index = Math.floor(Math.random() * deck.length);
    return deck.splice(index, 1)[0];
}
