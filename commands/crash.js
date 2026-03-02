const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, COLORS, parseBet, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');
const achievementsHelper = require('../helpers/achievementsHelper');

const activeGames = new Set();

// --- CONFIGURATION DU GAME LOOP ---
const TICK_INTERVAL = 200;       // Vérification du crash toutes les 200ms (précision)
const DISPLAY_INTERVAL = 2000;   // Mise à jour de l'embed toutes les 2s (anti rate-limit)
const MULTIPLIER_SPEED = 0.1;    // +0.1x par seconde
const COLLECTOR_TIMEOUT = 120000; // 2 minutes max par partie

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

        // Débit immédiat pour éviter les "free rolls" en cas de crash du bot
        await db.updateBalance(message.author.id, -bet, 'Crash: Mise');
        activeGames.add(message.author.id);

        // --- CALCUL DU CRASH POINT ---
        const crashPoint = Math.max(1.1, parseFloat((100 / (Math.random() * 100)).toFixed(2)));

        // --- ÉTAT DU JEU (closure) ---
        let cashedOut = false;
        const startTime = Date.now(); // Référence temporelle pour le calcul time-delta
        let lastEditTime = 0;         // Timestamp du dernier msg.edit (throttling)

        const customId = `crash_cashout_${message.id}`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(customId)
                .setLabel('💰 CASH OUT')
                .setStyle(ButtonStyle.Danger)
        );

        // --- FONCTION D'EMBED ---
        const getEmbed = (status, multiplier, profit = 0n) => {
            const gloryStatus = eventsManager.getGloryHourStatus();
            let desc = '';

            if (status === 'playing') {
                desc = `Multiplicateur: **${multiplier}x**\n\nCliquez sur le bouton pour encaisser !`;
            } else if (status === 'crashed') {
                desc = `Le multiplicateur a crashé à **${crashPoint}x**.\n\nVous avez perdu ${formatCoins(bet)}.`;
            } else if (status === 'cashed') {
                const eventIndicator = gloryStatus.active ? ' (x2) ⚡️' : '';
                desc = `Vous avez retiré à **${multiplier}x**.\nProfit: ${formatCoins(profit)}${eventIndicator}\n\n(Le crash aurait eu lieu à **${crashPoint}x**)`;
            }

            if (gloryStatus.active && status !== 'crashed') {
                desc = `**${gloryStatus.text}**\n\n` + desc;
            }

            const color = status === 'playing' ? COLORS.PRIMARY 
                        : status === 'crashed' ? COLORS.ERROR 
                        : COLORS.SUCCESS;

            const embed = createEmbed(
                status === 'playing' ? 'Crash 📈' : (status === 'crashed' ? 'CRASHED! 💥' : 'Cashed Out! 💰'),
                desc,
                color
            );

            let footerText = `Mise: ${bet.toLocaleString('fr-FR')} coins`;
            if (status === 'cashed') {
                footerText += ` | Profit: +${formatCoins(profit)}`;
            }
            embed.setFooter({ text: footerText });

            return embed;
        };

        // --- CALCUL DU MULTIPLICATEUR BASÉ SUR LE TEMPS RÉEL ---
        // Garantit la synchronisation même en cas de lag du bot
        const getMultiplierAtTime = (timestamp) => {
            const elapsed = (timestamp - startTime) / 1000;
            return 1.0 + elapsed * MULTIPLIER_SPEED;
        };

        // --- ENVOI DU MESSAGE INITIAL ---
        const msg = await message.reply({ 
            embeds: [getEmbed('playing', '1.00')],
            components: [row]
        });

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id && i.customId === customId,
            time: COLLECTOR_TIMEOUT
        });

        // --- GAME LOOP (tick rapide, affichage throttlé) ---
        // Le tick tourne à 200ms pour détecter le crash avec précision.
        // L'embed n'est mis à jour que toutes les 2s pour éviter le rate-limit API Discord.
        const interval = setInterval(() => {
            if (cashedOut) return;

            const now = Date.now();
            const currentMultiplier = getMultiplierAtTime(now);

            // === CRASH DÉTECTÉ ===
            if (currentMultiplier >= crashPoint) {
                clearInterval(interval);
                cashedOut = true; // Empêche tout cashout tardif
                collector.stop();
                activeGames.delete(message.author.id);

                // Mise à jour finale (crash) — .catch pour ne jamais planter la logique
                msg.edit({ 
                    embeds: [getEmbed('crashed', crashPoint)],
                    components: []
                }).catch(() => null);

                // --- Achievements Engine ---
                db.getUser(message.author.id).then(async u => {
                    const newBal = BigInt(u.balance);
                    const chance = 1.0 / crashPoint; // Proba estimée
                    await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'RISK', {
                        bet: bet,
                        outcome: 'loss',
                        winChance: chance,
                        potentialWin: 0n,
                        isJackpot: false,
                        newBalance: newBal
                    });
                    await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'RESILIENCE', {
                        bet: bet,
                        outcome: 'loss',
                        winChance: chance,
                        newBalance: newBal
                    });
                    await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'CAPITAL', {});
                }).catch(() => null);
                // ---------------------------

                return;
            }

            // === THROTTLING DE L'AFFICHAGE ===
            // On ne met à jour l'embed que si suffisamment de temps s'est écoulé
            if (now - lastEditTime >= DISPLAY_INTERVAL) {
                lastEditTime = now;
                msg.edit({ 
                    embeds: [getEmbed('playing', currentMultiplier.toFixed(2))],
                    components: [row]
                }).catch(() => null); // Silencieux si rate-limited
            }

        }, TICK_INTERVAL);

        // --- HANDLER CASH OUT ---
        collector.on('collect', async i => {
            // Clic tardif après crash → defer silencieux
            if (cashedOut) {
                await i.deferUpdate().catch(() => null);
                return;
            }

            cashedOut = true;
            clearInterval(interval);
            collector.stop();
            activeGames.delete(message.author.id);

            // === ANTI-TRICHE : recalcul au timestamp exact du clic ===
            // On ne se fie PAS à la dernière valeur affichée dans l'embed.
            // Le multiplicateur est recalculé au moment précis de l'interaction.
            const cashoutMultiplier = getMultiplierAtTime(Date.now());

            // Sécurité : ne jamais dépasser le crashPoint
            const safeMult = Math.min(cashoutMultiplier, crashPoint);

            const total = BigInt(Math.floor(Number(bet) * safeMult));
            const profit = total - bet;
            let finalGain = profit;

            if (eventsManager.isDoubleGainActive()) {
                finalGain *= 2n;
            }

            // Appliquer Bonus de Prestige
            const { applyPrestigeBonus } = require('../prestigeConfig');
            finalGain = applyPrestigeBonus(finalGain, parseInt(user.prestige || 0));

            const finalMultiplier = safeMult.toFixed(2);

            // Crédit atomique : mise + gain (éventuellement doublé)
            await db.updateBalance(message.author.id, bet + finalGain, 'Crash: Cashout');

            // Mise à jour UI — prioritaire pour la réactivité
            await i.update({ 
                embeds: [getEmbed('cashed', finalMultiplier, finalGain)],
                components: []
            }).catch(() => null);

            // Announce big wins
            const { announceBigWin } = require('../utils');
            await announceBigWin(message.client, message.author, 'Crash', bet, finalGain, `**Multiplicateur:** x${safeMult.toFixed(2)}`);

            // --- Achievements Engine ---
            const newBal = await db.getUser(message.author.id).then(u => BigInt(u.balance));
            const chance = 1.0 / safeMult;
            await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'RISK', {
                bet: bet,
                outcome: 'win',
                winChance: chance, 
                potentialWin: bet + finalGain,
                isJackpot: false,
                newBalance: newBal
            });
            await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'RESILIENCE', {
                bet: bet,
                outcome: 'win',
                winChance: chance,
                newBalance: newBal
            });
            await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'CAPITAL', {});
            // ---------------------------
        });
    }
};
