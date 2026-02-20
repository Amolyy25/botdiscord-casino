const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');

const activeGames = new Map();
const MAX_FLOOR = 8;
const DOORS_PER_FLOOR = 3;
const MAX_VISIBLE_ROWS = 4; // Discord limit: 5 rows max, 1 for cashout = 4 for floors

const MULTIPLIERS = [1.42, 2.02, 2.88, 4.11, 5.86, 8.35, 11.91, 16.98];

function buildComponents(state) {
    const rows = [];
    const currentFloor = state.currentFloor; // 1-indexed, the floor the player is choosing now

    // Determine which floors to show as button rows
    // We show floors from bottom to top, but only the last MAX_VISIBLE_ROWS
    const completedFloors = state.floors; // array of { chosen, losingDoor, won }
    const totalFloorsToShow = completedFloors.length + (state.gameOver ? 0 : 1); // completed + active
    const startShow = Math.max(0, totalFloorsToShow - MAX_VISIBLE_ROWS);

    // Build floor rows (bottom = first completed, top = current active)
    // Discord displays rows top-to-bottom, but we want highest floor on top
    // So we build in reverse: highest floor first

    const floorRows = [];

    // Active floor (if game not over)
    if (!state.gameOver) {
        const activeRow = new ActionRowBuilder();
        for (let d = 0; d < DOORS_PER_FLOOR; d++) {
            activeRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`towers_door_${d}`)
                    .setLabel('Porte')
                    .setEmoji('🚪')
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        floorRows.push({ floor: currentFloor, row: activeRow });
    }

    // Completed floors (most recent first = highest floor first)
    for (let i = completedFloors.length - 1; i >= 0; i--) {
        const f = completedFloors[i];
        const fRow = new ActionRowBuilder();
        for (let d = 0; d < DOORS_PER_FLOOR; d++) {
            const btn = new ButtonBuilder()
                .setCustomId(`towers_past_${i}_${d}`)
                .setDisabled(true);

            if (d === f.chosen) {
                if (f.won) {
                    btn.setLabel('Gagne').setEmoji('✅').setStyle(ButtonStyle.Success);
                } else {
                    btn.setLabel('Perdu').setEmoji('❌').setStyle(ButtonStyle.Danger);
                }
            } else if (d === f.losingDoor) {
                // Reveal losing door on game end only
                if (state.gameOver) {
                    btn.setLabel('Perdu').setEmoji('❌').setStyle(ButtonStyle.Danger);
                } else {
                    btn.setLabel('-').setStyle(ButtonStyle.Secondary);
                }
            } else {
                btn.setLabel('-').setStyle(ButtonStyle.Secondary);
            }
            fRow.addComponents(btn);
        }
        floorRows.push({ floor: i + 1, row: fRow });
    }

    // Trim to MAX_VISIBLE_ROWS
    const visibleFloors = floorRows.slice(0, MAX_VISIBLE_ROWS);

    // Add floors (highest first = top of message)
    for (const vf of visibleFloors) {
        rows.push(vf.row);
    }

    // Add cashout row (only if at least 1 floor completed and game not over)
    if (completedFloors.length >= 1 && !state.gameOver) {
        const cashoutRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('towers_cashout')
                .setLabel('Recuperer Gains')
                .setStyle(ButtonStyle.Primary)
        );
        rows.push(cashoutRow);
    }

    return rows;
}

function buildEmbed(state, status = 'playing') {
    const floorIdx = state.currentFloor - 1; // 0-indexed
    const mult = floorIdx > 0 ? MULTIPLIERS[floorIdx - 1] : 1.00;
    const nextMult = floorIdx < MAX_FLOOR ? MULTIPLIERS[floorIdx] : MULTIPLIERS[MAX_FLOOR - 1];
    let currentGain = BigInt(Math.floor(Number(state.bet) * mult));
    const completedFloors = state.floors;
    const gloryStatus = eventsManager.getGloryHourStatus();

    if (gloryStatus.active) {
        const profit = currentGain - state.bet;
        currentGain = state.bet + (profit * 2n);
    }

    // Appliquer Bonus de Prestige au profit actuel/potentiel
    const { applyPrestigeBonus } = require('../prestigeConfig');
    let currentProfit = currentGain - state.bet;
    currentProfit = applyPrestigeBonus(currentProfit, state.prestige || 0);

    let desc = '';
    if (gloryStatus.active && status !== 'lost' && status !== 'timeout') {
        desc += `**${gloryStatus.text}**\n\n`;
    }

    desc += `Mise: ${formatCoins(state.bet)}\n`;

    const eventIndicator = gloryStatus.active ? ' (x2) ⚡️' : '';

    if (status === 'playing') {
        // Show summary of hidden floors
        if (completedFloors.length > MAX_VISIBLE_ROWS) {
            const hidden = completedFloors.length - MAX_VISIBLE_ROWS;
            desc += `Etages 1-${hidden}: Valides\n`;
        }
        desc += `\nEtage actuel: **${state.currentFloor}** / ${MAX_FLOOR}\n`;
        desc += `Multiplicateur suivant: **x${nextMult.toFixed(2)}**\n`;
        if (completedFloors.length > 0) {
            desc += `Profit actuel: ${formatCoins(currentProfit)}${eventIndicator} (x${mult.toFixed(2)})\n`;
        }
        desc += `\nChoisissez une porte !`;
    } else if (status === 'lost') {
        desc += `\nEtage: **${state.currentFloor}** / ${MAX_FLOOR}\n`;
        desc += `\nVous avez choisi la mauvaise porte ! Mise perdue.`;
    } else if (status === 'cashout') {
        const cashMult = MULTIPLIERS[completedFloors.length - 1];
        let cashGain = BigInt(Math.floor(Number(state.bet) * cashMult));
        let profit = cashGain - state.bet;
        if (gloryStatus.active) profit *= 2n;

        // Appliquer Bonus de Prestige
        const { applyPrestigeBonus } = require('../prestigeConfig');
        profit = applyPrestigeBonus(profit, state.prestige || 0);

        desc += `\nEtages completes: **${completedFloors.length}** / ${MAX_FLOOR}\n`;
        desc += `Multiplicateur: **x${cashMult.toFixed(2)}**\n`;
        desc += `Profit: ${formatCoins(profit)}${eventIndicator}\n\nVous avez recupere vos gains !`;
    } else if (status === 'cleared') {
        const cashMult = MULTIPLIERS[MAX_FLOOR - 1];
        let cashGain = BigInt(Math.floor(Number(state.bet) * cashMult));
        let profit = cashGain - state.bet;
        if (gloryStatus.active) profit *= 2n;

        // Appliquer Bonus de Prestige
        const { applyPrestigeBonus } = require('../prestigeConfig');
        profit = applyPrestigeBonus(profit, state.prestige || 0);

        desc += `\nTous les etages completes !\n`;
        desc += `Multiplicateur: **x${cashMult.toFixed(2)}**\n`;
        desc += `Profit: ${formatCoins(profit)}${eventIndicator}\n\nFelicitations, tour complete !`;
    } else if (status === 'timeout') {
        desc += `\nTemps ecoule. Mise perdue.`;
    }

    const color = (status === 'cashout' || status === 'cleared') ? COLORS.SUCCESS
               : (status === 'lost' || status === 'timeout') ? COLORS.ERROR
               : COLORS.PRIMARY;

    const embed = createEmbed('Towers -- La Tour', desc, color);
    
    let footerText = `Mise: ${state.bet.toLocaleString('fr-FR')} coins`;
    if (status !== 'lost' && status !== 'timeout' && status !== 'playing') {
        // En cas de cashout ou completion
        const cashMult = MULTIPLIERS[completedFloors.length - 1];
        let cashGain = BigInt(Math.floor(Number(state.bet) * cashMult));
        let finalProfit = cashGain - state.bet;
        if (gloryStatus.active) finalProfit *= 2n;
        const { applyPrestigeBonus } = require('../prestigeConfig');
        finalProfit = applyPrestigeBonus(finalProfit, state.prestige || 0);
        
        footerText += ` | Profit: +${formatCoins(finalProfit)}`;
    } else if (status === 'playing' && completedFloors.length > 0) {
        footerText += ` | Profit actuel: +${formatCoins(currentProfit)}`;
    }
    
    embed.setFooter({ text: footerText });

    return embed;
}

module.exports = {
    name: 'towers',
    aliases: ['tw'],
    description: 'Jouez a Towers (La Tour)',
    async execute(message, args, db) {
        const userId = message.author.id;

        if (activeGames.has(userId)) {
            return message.reply({
                embeds: [createEmbed('Erreur', 'Vous avez deja une partie de Towers en cours.', COLORS.ERROR)]
            });
        }

        const user = await db.getUser(userId);
        const bet = parseBet(args[0], user.balance);

        if (bet === null || bet <= 0n) {
            return message.reply({
                embeds: [createEmbed('Usage', 'Format: `;towers [mise/all]`', COLORS.ERROR)]
            });
        }

        if (BigInt(user.balance) < bet) {
            return message.reply({
                embeds: [createEmbed('Erreur', 'Solde insuffisant.', COLORS.ERROR)]
            });
        }

        await db.updateBalance(userId, -bet, 'Towers: Mise');

        const state = {
            userId,
            bet,
            currentFloor: 1,
            floors: [],       // { chosen, losingDoor, won }
            prestige: parseInt(user.prestige || 0),
            lastClick: 0,
            gameOver: false
        };
        activeGames.set(userId, state);

        const gameMsg = await message.reply({
            embeds: [buildEmbed(state)],
            components: buildComponents(state)
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
            if (i.customId === 'towers_cashout') {
                st.gameOver = true;
                collector.stop('cashout');

                const cashMult = MULTIPLIERS[st.floors.length - 1];
                const winAmount = BigInt(Math.floor(Number(st.bet) * cashMult));
                let profit = winAmount - st.bet;
                if (eventsManager.isDoubleGainActive()) profit *= 2n;

                // Appliquer Bonus de Prestige
                const { applyPrestigeBonus } = require('../prestigeConfig');
                profit = applyPrestigeBonus(profit, parseInt(user.prestige || 0));

                await db.updateBalance(userId, st.bet + profit, 'Towers: Cashout');

                await i.update({
                    embeds: [buildEmbed(st, 'cashout')],
                    components: buildComponents(st)
                }).catch(() => {});

                // Announce big wins
                const { announceBigWin } = require('../utils');
                await announceBigWin(message.client, message.author, 'Towers', st.bet, profit, `**Multiplicateur:** x${cashMult.toFixed(2)}\n**Étages:** ${st.floors.length} / ${MAX_FLOOR}`);
                activeGames.delete(userId);
                return;
            }

            // --- DOOR CLICK ---
            if (!i.customId.startsWith('towers_door_')) {
                await i.deferUpdate().catch(() => {});
                return;
            }

            const doorIdx = parseInt(i.customId.replace('towers_door_', ''));
            if (isNaN(doorIdx) || doorIdx < 0 || doorIdx >= DOORS_PER_FLOOR) {
                await i.deferUpdate().catch(() => {});
                return;
            }

            // Generate losing door for this floor (1 out of 3)
            const losingDoor = Math.floor(Math.random() * DOORS_PER_FLOOR);
            const won = doorIdx !== losingDoor;

            st.floors.push({ chosen: doorIdx, losingDoor, won });

            if (!won) {
                // LOST
                st.gameOver = true;
                collector.stop('lost');

                await i.update({
                    embeds: [buildEmbed(st, 'lost')],
                    components: buildComponents(st)
                }).catch(() => {});

                activeGames.delete(userId);
                return;
            }

            // Won this floor
            st.currentFloor++;

            // Cleared all floors
            if (st.currentFloor > MAX_FLOOR) {
                st.gameOver = true;
                collector.stop('cleared');

                const cashMult = MULTIPLIERS[MAX_FLOOR - 1];
                const winAmount = BigInt(Math.floor(Number(st.bet) * cashMult));
                let profit = winAmount - st.bet;
                if (eventsManager.isDoubleGainActive()) profit *= 2n;

                // Appliquer Bonus de Prestige
                const { applyPrestigeBonus } = require('../prestigeConfig');
                profit = applyPrestigeBonus(profit, parseInt(user.prestige || 0));

                await db.updateBalance(userId, st.bet + profit, 'Towers: Cashout');

                await i.update({
                    embeds: [buildEmbed(st, 'cleared')],
                    components: buildComponents(st)
                }).catch(() => {});

                // Announce big wins
                const { announceBigWin } = require('../utils');
                await announceBigWin(message.client, message.author, 'Towers', st.bet, profit, `**Multiplicateur:** x${cashMult.toFixed(2)}\n**Étages:** ${st.floors.length} / ${MAX_FLOOR}`);

                activeGames.delete(userId);
                return;
            }

            // Continue to next floor
            await i.update({
                embeds: [buildEmbed(st)],
                components: buildComponents(st)
            }).catch(() => {});
        });

        collector.on('end', (_, reason) => {
            const st = activeGames.get(userId);
            if (st && !st.gameOver) {
                st.gameOver = true;
                gameMsg.edit({
                    embeds: [buildEmbed(st, 'timeout')],
                    components: buildComponents(st)
                }).catch(() => {});
                activeGames.delete(userId);
            }
        });
    }
};
