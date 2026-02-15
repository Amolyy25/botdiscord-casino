const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');

const activeGames = new Map();
const ROWS = 3;
const COLS = 5;
const PLAYABLE_CELLS = 15;

// Combinatorial multiplier with 3% house edge
function calculateMultiplier(mines, safeRevealed) {
    let probability = 1;
    for (let i = 0; i < safeRevealed; i++) {
        const remaining = PLAYABLE_CELLS - i;
        const safe = PLAYABLE_CELLS - mines - i;
        probability *= safe / remaining;
    }
    if (probability <= 0) return 1;
    return Math.floor((1 / probability) * 0.97 * 100) / 100;
}

function buildGrid(state, revealAll = false) {
    const rows = [];
    
    // Grid rows (0 to ROWS-1)
    for (let r = 0; r < ROWS; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < COLS; c++) {
            const idx = r * COLS + c;
            const btn = new ButtonBuilder().setCustomId(`mines_${idx}`);

            if (revealAll && state.minePositions.has(idx) && !state.revealed.has(idx)) {
                btn.setLabel('MINE').setEmoji('💣').setStyle(ButtonStyle.Danger).setDisabled(true);
            } else if (state.revealed.has(idx)) {
                if (state.minePositions.has(idx)) {
                    btn.setLabel('MINE').setEmoji('💣').setStyle(ButtonStyle.Danger).setDisabled(true);
                } else {
                    btn.setLabel('OK').setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
                }
            } else {
                btn.setLabel('?').setEmoji('❓').setStyle(ButtonStyle.Secondary).setDisabled(revealAll || state.gameOver);
            }
            row.addComponents(btn);
        }
        rows.push(row);
    }

    // Cashout row
    const cashoutRow = new ActionRowBuilder();
    if (state.safeCount >= 1 && !state.gameOver) {
        cashoutRow.addComponents(
            new ButtonBuilder()
                .setCustomId('mines_cashout')
                .setLabel('Récupérer Gains')
                .setStyle(ButtonStyle.Primary)
        );
    } else {
        cashoutRow.addComponents(
            new ButtonBuilder()
                .setCustomId('mines_cashout_disabled')
                .setLabel('Récupérer Gains')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
    }
    rows.push(cashoutRow);

    return rows;
}

function buildEmbed(state, status = 'playing') {
    let potentialGain = BigInt(Math.floor(Number(state.bet) * state.multiplier));
    const gloryStatus = eventsManager.getGloryHourStatus();

    if (gloryStatus.active) {
        const profit = potentialGain - state.bet;
        potentialGain = state.bet + (profit * 2n);
    }

    const currentProfit = potentialGain - state.bet;
    const eventIndicator = gloryStatus.active ? ' (x2) ⚡️' : '';

    let desc = '';
    if (gloryStatus.active && status !== 'lost' && status !== 'timeout') {
        desc += `**${gloryStatus.text}**\n\n`;
    }

    desc += `Mise: ${formatCoins(state.bet)}\n`;
    desc += `Mines: **${state.numMines}** | Cases révélées: **${state.safeCount}**\n`;
    desc += `Multiplicateur: **x${state.multiplier.toFixed(2)}**\n`;

    if (status === 'playing') {
        desc += `Profit potentiel: ${formatCoins(currentProfit)}${eventIndicator}\n\nCliquez sur une case [?] pour la révéler.`;
    } else if (status === 'lost') {
        desc += `\nVous avez touché une mine ! Mise perdue.`;
    } else if (status === 'cashout') {
        desc += `Profit: ${formatCoins(currentProfit)}${eventIndicator}\n\nVous avez récupéré vos gains !`;
    } else if (status === 'timeout') {
        desc += `\nTemps écoulé. Mise perdue.`;
    }

    const color = status === 'cashout' ? COLORS.SUCCESS
               : status === 'lost' || status === 'timeout' ? COLORS.ERROR
               : COLORS.PRIMARY;

    return createEmbed('Mines -- Démineur', desc, color);
}

module.exports = {
    name: 'mines',
    aliases: ['mn'],
    description: 'Jouez au Démineur (Mines)',
    async execute(message, args, db) {
        const userId = message.author.id;

        if (activeGames.has(userId)) {
            return message.reply({
                embeds: [createEmbed('Erreur', 'Vous avez déjà une partie de Mines en cours.', COLORS.ERROR)]
            });
        }

        const user = await db.getUser(userId);
        const bet = parseBet(args[0], user.balance);

        if (bet === null || bet <= 0n) {
            return message.reply({
                embeds: [createEmbed('Usage', `Format: \`;mines [mise/all] [mines]\`\nMines: 1 à ${PLAYABLE_CELLS - 1} (défaut: 1)`, COLORS.ERROR)]
            });
        }

        if (BigInt(user.balance) < bet) {
            return message.reply({
                embeds: [createEmbed('Erreur', 'Solde insuffisant.', COLORS.ERROR)]
            });
        }

        let numMines = 1;
        if (args[1]) {
            numMines = parseInt(args[1]);
            if (isNaN(numMines) || numMines < 1 || numMines >= PLAYABLE_CELLS) {
                return message.reply({
                    embeds: [createEmbed('Erreur', `Le nombre de mines doit être entre 1 et ${PLAYABLE_CELLS - 1}.`, COLORS.ERROR)]
                });
            }
        }

        await db.updateBalance(userId, -bet);

        // Place mines randomly in positions 0-14 (15 playable cells)
        const minePositions = new Set();
        while (minePositions.size < numMines) {
            minePositions.add(Math.floor(Math.random() * PLAYABLE_CELLS));
        }

        const state = {
            bet,
            numMines,
            minePositions,
            revealed: new Set(),
            safeCount: 0,
            multiplier: 1.00,
            lastClick: 0,
            gameOver: false
        };
        activeGames.set(userId, state);

        const gameMsg = await message.reply({
            embeds: [buildEmbed(state)],
            components: buildGrid(state)
        });

        const collector = gameMsg.createMessageComponentCollector({
            filter: i => i.user.id === userId,
            time: 120000
        });

        collector.on('collect', async (i) => {
            const st = activeGames.get(userId);
            if (!st || st.gameOver) { await i.deferUpdate().catch(() => {}); return; }

            // Anti-spam 500ms
            const now = Date.now();
            if (now - st.lastClick < 500) { await i.deferUpdate().catch(() => {}); return; }
            st.lastClick = now;

            // --- CASHOUT ---
            if (i.customId === 'mines_cashout') {
                st.gameOver = true;
                collector.stop('cashout');

                const winAmount = BigInt(Math.floor(Number(st.bet) * st.multiplier));
                let profit = winAmount - st.bet;
                if (eventsManager.isDoubleGainActive()) profit *= 2n;

                await db.updateBalance(userId, st.bet + profit);

                await i.update({
                    embeds: [buildEmbed(st, 'cashout')],
                    components: buildGrid(st, true)
                }).catch(() => {});

                announceBigWin(message, st, profit);
                activeGames.delete(userId);
                return;
            }
            
            // Ignore disabled cashout clicks
            if (i.customId === 'mines_cashout_disabled') {
                await i.deferUpdate().catch(() => {});
                return;
            }

            // --- CELL CLICK ---
            const idx = parseInt(i.customId.replace('mines_', ''));
            if (isNaN(idx) || idx < 0 || idx >= PLAYABLE_CELLS || st.revealed.has(idx)) {
                await i.deferUpdate().catch(() => {});
                return;
            }

            st.revealed.add(idx);

            // Hit a mine
            if (st.minePositions.has(idx)) {
                st.gameOver = true;
                collector.stop('lost');
                await i.update({
                    embeds: [buildEmbed(st, 'lost')],
                    components: buildGrid(st, true)
                }).catch(() => {});
                activeGames.delete(userId);
                return;
            }

            // Safe cell
            st.safeCount++;
            st.multiplier = calculateMultiplier(numMines, st.safeCount);

            // All safe cells cleared = auto-win
            if (st.safeCount >= PLAYABLE_CELLS - numMines) {
                st.gameOver = true;
                collector.stop('cleared');

                const winAmount = BigInt(Math.floor(Number(st.bet) * st.multiplier));
                let profit = winAmount - st.bet;
                if (eventsManager.isDoubleGainActive()) profit *= 2n;

                await db.updateBalance(userId, st.bet + profit);
                await i.update({
                    embeds: [buildEmbed(st, 'cashout')],
                    components: buildGrid(st, true)
                }).catch(() => {});

                announceBigWin(message, st, profit);
                activeGames.delete(userId);
                return;
            }

            await i.update({
                embeds: [buildEmbed(st)],
                components: buildGrid(st)
            }).catch(() => {});
        });

        collector.on('end', (_, reason) => {
            const st = activeGames.get(userId);
            if (st && !st.gameOver) {
                st.gameOver = true;
                gameMsg.edit({
                    embeds: [buildEmbed(st, 'timeout')],
                    components: buildGrid(st, true)
                }).catch(() => {});
                activeGames.delete(userId);
            }
        });
    }
};

async function announceBigWin(message, state, profit) {
    if (profit < 500n) return;
    try {
        const { WINS_CHANNEL_ID } = require('../roleConfig');
        const ch = await message.client.channels.fetch(WINS_CHANNEL_ID);
        if (!ch) return;
        const embed = createEmbed(
            'GROS GAIN AUX MINES !',
            `**${message.author.username}** vient de gagner ${formatCoins(profit)} aux Mines !\n\n` +
            `**Mise:** ${formatCoins(state.bet)}\n` +
            `**Multiplicateur:** x${state.multiplier.toFixed(2)}\n` +
            `**Mines:** ${state.numMines}\n` +
            `**Profit:** ${formatCoins(profit)}`,
            COLORS.GOLD
        );
        embed.setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
        await ch.send({ embeds: [embed] });
    } catch (e) {
        console.error('Failed to send mines win announcement:', e);
    }
}
