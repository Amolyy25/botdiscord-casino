const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');
const achievementsHelper = require('../helpers/achievementsHelper');

module.exports = {
    name: 'bj',
    description: 'Jouez au Blackjack (Split & Double supportés)',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const initialBet = parseBet(args[0], user.balance);

        if (initialBet === null || initialBet <= 0n) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;bj [mise/all]\``, COLORS.ERROR)]
            });
        }

        if (BigInt(user.balance) < initialBet) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Solde insuffisant.`, COLORS.ERROR)]
            });
        }

        // Deduct initial bet
        await db.updateBalance(message.author.id, -initialBet, 'Blackjack: Mise');

        const deck = createDeck();
        
        // Game State
        const gameState = {
            playerHands: [{ cards: [drawCard(deck), drawCard(deck)], bet: initialBet, active: true, done: false, result: null, gain: 0n }],
            dealerHand: [drawCard(deck), drawCard(deck)],
            activeHandIndex: 0,
            status: 'playing', // 'playing', 'dealer_turn', 'finished'
            splitUsed: false,
            doubleUsed: false
        };

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

        const formatHand = (cards, hideSecond = false) => {
            const suitEmojis = { '♠': '♠️', '♥': '♥️', '♦': '♦️', '♣': '♣️' };
            return cards.map((card, i) => {
                if (hideSecond && i === 1) return '` ? `';
                return `\`${card.rank}${suitEmojis[card.suit] || card.suit}\``;
            }).join(' ');
        };

        const renderEmbed = (finalResultText = null) => {
            const gloryStatus = eventsManager.getGloryHourStatus();
            const dealerVal = (gameState.status === 'playing') ? '?' : getHandValue(gameState.dealerHand);
            
            let color = COLORS.PRIMARY;
            if (gameState.status === 'finished') {
                const totalProfit = gameState.playerHands.reduce((acc, h) => acc + h.gain, 0n);
                if (totalProfit > 0n) color = COLORS.SUCCESS;
                else if (totalProfit < 0n) color = COLORS.ERROR;
                else color = COLORS.GOLD;
            }

            let description = '';
            if (gloryStatus.active && gameState.status !== 'finished') {
                description += `⚡ **${gloryStatus.text}** ⚡\n\n`;
            }

            // Dealer section
            description += `**Croupier** 🤵\n> ${formatHand(gameState.dealerHand, gameState.status === 'playing')}\n> 🧾 Total: \`${dealerVal}\`\n\n`;

            description += `───────────────\n\n`;

            // Player hands
            gameState.playerHands.forEach((hand, idx) => {
                const val = getHandValue(hand.cards);
                const isCurrent = gameState.status === 'playing' && gameState.activeHandIndex === idx;
                const handTitle = gameState.playerHands.length > 1 ? `**Main #${idx + 1}**` : `**Vôtre Main**`;
                const pointer = isCurrent ? ' ❮' : '';
                const resultTag = hand.done ? ` | **${hand.result}**` : '';
                
                description += `${handTitle}${pointer}\n> ${formatHand(hand.cards)}\n> 🧾 Total: \`${val}\`${resultTag}\n\n`;
            });

            if (finalResultText) {
                description += `### ${finalResultText}`;
            }

            const embed = createEmbed('🃏 Blackjack Royale', description, color);
            
            // Set thumbnail for a more premium look
            embed.setThumbnail('https://i.imgur.com/Gis6bXn.png'); 
            
            let footerText = `Mise: ${initialBet.toLocaleString('fr-FR')} SCoins`;
            if (gameState.status === 'finished') {
                const totalProfit = gameState.playerHands.reduce((acc, h) => acc + h.gain, 0n);
                footerText += ` | Profit Total: ${totalProfit > 0n ? '+' : ''}${formatCoins(totalProfit)}`;
            }
            embed.setFooter({ text: footerText });

            return embed;
        };

        const getButtons = () => {
            const row = new ActionRowBuilder();
            const currentHand = gameState.playerHands[gameState.activeHandIndex];
            const canSplit = !gameState.splitUsed && currentHand.cards.length === 2 && currentHand.cards[0].rank === currentHand.cards[1].rank;
            const canDouble = currentHand.cards.length === 2 && !gameState.doubleUsed; // Usually only on first 2 cards

            row.addComponents(
                new ButtonBuilder().setCustomId('hit').setLabel('Tirer').setStyle(ButtonStyle.Success).setEmoji('🃏'),
                new ButtonBuilder().setCustomId('stand').setLabel('Rester').setStyle(ButtonStyle.Secondary).setEmoji('🛑')
            );

            if (canDouble) {
                row.addComponents(new ButtonBuilder().setCustomId('double').setLabel('Double (x2)').setStyle(ButtonStyle.Primary).setEmoji('💰'));
            }

            if (canSplit) {
                row.addComponents(new ButtonBuilder().setCustomId('split').setLabel('Séparer').setStyle(ButtonStyle.Primary).setEmoji('✂️'));
            }

            return [row];
        };

        const gameMsg = await message.reply({ 
            embeds: [renderEmbed()],
            components: getButtons()
        });

        // Check for Natural Blackjack (21 on first deal)
        if (getHandValue(gameState.playerHands[0].cards) === 21) {
            gameState.playerHands[0].done = true;
            gameState.playerHands[0].result = 'Blackjack! 🃏';
            await resolveDealer();
            return;
        }

        const collector = gameMsg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id,
            time: 120000 
        });

        const resolveDealer = async () => {
            gameState.status = 'dealer_turn';
            while (getHandValue(gameState.dealerHand) < 17) {
                gameState.dealerHand.push(drawCard(deck));
            }
            gameState.status = 'finished';

            const dealerVal = getHandValue(gameState.dealerHand);
            let totalGain = 0n;
            let totalBet = 0n;

            for (const hand of gameState.playerHands) {
                totalBet += hand.bet;
                if (hand.result === 'Buste') {
                    hand.gain = -hand.bet;
                    continue;
                }

                const playerVal = getHandValue(hand.cards);
                if (dealerVal > 21 || playerVal > dealerVal) {
                    hand.result = 'Gagné';
                    let winAmount = hand.bet;
                    winAmount = await eventsManager.applyGloryHourMultiplier(message.author.id, winAmount, db);
                    
                    const { applyPrestigeBonus } = require('../prestigeConfig');
                    winAmount = applyPrestigeBonus(winAmount, parseInt(user.prestige || 0));
                    
                    hand.gain = winAmount;
                    await db.updateBalance(message.author.id, hand.bet + winAmount, 'Blackjack: Gain');
                } else if (playerVal < dealerVal) {
                    hand.result = 'Perdu';
                    hand.gain = -hand.bet;
                } else {
                    hand.result = 'Égalité';
                    hand.gain = 0n;
                    await db.updateBalance(message.author.id, hand.bet, 'Blackjack: Push');
                }
            }

            totalGain = gameState.playerHands.reduce((acc, h) => acc + h.gain, 0n);
            
            // Achievements
            const newBal = await db.getUser(message.author.id).then(u => BigInt(u.balance));
            await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'RISK', {
                bet: totalBet,
                outcome: totalGain > 0n ? 'win' : (totalGain < 0n ? 'loss' : 'push'),
                winChance: 0.48,
                potentialWin: totalBet * 2n,
                isJackpot: false,
                newBalance: newBal
            });

            const resultText = totalGain > 0n ? '🎉 Vous avez gagné !' : (totalGain < 0n ? '💥 Le casino gagne !' : '🤝 Égalité !');
            
            await gameMsg.edit({ embeds: [renderEmbed(resultText)], components: [] }).catch(() => null);
            
            if (totalGain > 0n) {
                const { announceBigWin } = require('../utils');
                await announceBigWin(message.client, message.author, 'Blackjack', totalBet, totalGain);
            }
            
            collector.stop();
        };

        const nextHand = async () => {
            gameState.activeHandIndex++;
            if (gameState.activeHandIndex >= gameState.playerHands.length) {
                // Check if all busted
                if (gameState.playerHands.every(h => getHandValue(h.cards) > 21)) {
                    gameState.status = 'finished';
                    gameState.playerHands.forEach(h => { h.result = 'Buste'; h.gain = -h.bet; });
                    await gameMsg.edit({ embeds: [renderEmbed('💥 Buste ! Vous avez tout perdu.')], components: [] }).catch(() => null);
                    collector.stop();
                } else {
                    await resolveDealer();
                }
            } else {
                await gameMsg.edit({ embeds: [renderEmbed()], components: getButtons() }).catch(() => null);
            }
        };

        collector.on('collect', async i => {
            const currentHand = gameState.playerHands[gameState.activeHandIndex];
            
            if (i.customId === 'hit') {
                currentHand.cards.push(drawCard(deck));
                if (getHandValue(currentHand.cards) > 21) {
                    currentHand.done = true;
                    currentHand.result = 'Buste';
                    await i.deferUpdate();
                    await nextHand();
                } else {
                    await i.update({ embeds: [renderEmbed()], components: getButtons() });
                }
            } else if (i.customId === 'stand') {
                currentHand.done = true;
                currentHand.result = 'Reste';
                await i.deferUpdate();
                await nextHand();
            } else if (i.customId === 'double') {
                // Double bet
                const userLatest = await db.getUser(message.author.id);
                if (BigInt(userLatest.balance) < currentHand.bet) {
                    return i.reply({ content: 'Solde insuffisant pour doubler !', ephemeral: true });
                }
                
                await db.updateBalance(message.author.id, -currentHand.bet, 'Blackjack: Double');
                currentHand.bet *= 2n;
                currentHand.cards.push(drawCard(deck));
                currentHand.done = true;
                
                if (getHandValue(currentHand.cards) > 21) {
                    currentHand.result = 'Buste';
                } else {
                    currentHand.result = 'Double';
                }
                
                await i.deferUpdate();
                await nextHand();
            } else if (i.customId === 'split') {
                const userLatest = await db.getUser(message.author.id);
                if (BigInt(userLatest.balance) < initialBet) {
                    return i.reply({ content: 'Solde insuffisant pour séparer !', ephemeral: true });
                }

                await db.updateBalance(message.author.id, -initialBet, 'Blackjack: Split');
                
                const card2 = currentHand.cards.pop();
                const hand2 = { 
                    cards: [card2, drawCard(deck)], 
                    bet: initialBet, 
                    active: false, 
                    done: false, 
                    result: null, 
                    gain: 0n 
                };
                
                currentHand.cards.push(drawCard(deck));
                gameState.playerHands.push(hand2);
                gameState.splitUsed = true;

                await i.update({ embeds: [renderEmbed()], components: getButtons() });
            }
        });

        collector.on('end', (_, reason) => {
            if (reason === 'time' && gameState.status === 'playing') {
                gameMsg.edit({ components: [] }).catch(() => null);
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
