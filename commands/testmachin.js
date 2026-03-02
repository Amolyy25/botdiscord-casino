const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');
const db = require('../database');

module.exports = {
    name: 'testmachin',
    description: 'Teste une machine à sous immersive (Admin uniquement)',
    async execute(message, args, db) {
        // --- Restriction Admin ---
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({
                embeds: [createEmbed(
                    "Accès Refusé",
                    "Cette commande est réservée aux administrateurs du Secteur.",
                    COLORS.ERROR
                )]
            });
        }

        // --- Paramètres d'Aesthetic et Logique ---
        const EMOJIS = ['⬛', '💎', '🪙', '⚪'];
        const TIMEOUT_MS = 1600; // 1.6 secondes entre chaque frame de la séquence auto
        const MAX_AUTO_SPINS = 3; 

        // Initialisation de l'embed de lancement
        const initialEmbed = createEmbed(
            "⟁ MACHINE À SOUS | LE SECTEUR",
            "La machine est prête.\nAppuyez sur le bouton ci-dessous pour lancer la séquence.",
            COLORS.PRIMARY
        );

        const launchBtn = new ButtonBuilder()
            .setCustomId('slot_launch')
            .setLabel('🎰 LANCER')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(launchBtn);

        const botMessage = await message.reply({ embeds: [initialEmbed], components: [row] });

        // --- Logique Interactive ---
        const filter = i => i.user.id === message.author.id;
        // On donne un temps très large pour la session complète
        const collector = botMessage.createMessageComponentCollector({ filter, time: 60000 });

        let currentSpin = 0;
        let spinInterval = null;
        let isSpinning = false;
        let isStopped = false; // Flag pour savoir si l'utilisateur a forcé l'arrêt

        const getRandomSymbol = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

        // Helper pour afficher une frame de l'animation
        const renderFrame = (syms, text) => {
            return createEmbed(
                "⟁ MACHINE À SOUS | LE SECTEUR",
                `🎰 [ ${syms[0]} | ${syms[1]} | ${syms[2]} ]\n\n*${text}*`,
                COLORS.PRIMARY
            );
        };

        const stopBtn = new ButtonBuilder()
            .setCustomId('slot_stop')
            .setLabel('⏹ STOP')
            .setStyle(ButtonStyle.Danger);

        const stopRow = new ActionRowBuilder().addComponents(stopBtn);

        // --- Handler des boutons ---
        collector.on('collect', async i => {
            if (i.customId === 'slot_launch') {
                if (isSpinning) return;
                isSpinning = true;

                // Edit 1 : Le mécanisme s'enclenche
                await i.update({
                    embeds: [renderFrame(['⬛', '💎', '🪙'], "Le mécanisme s'enclenche...")],
                    components: [stopRow]
                }).catch(()=>null);

                // Lancement de l'interval de spin
                spinInterval = setInterval(async () => {
                    if (isStopped) return;
                    currentSpin++;

                    if (currentSpin >= MAX_AUTO_SPINS) {
                        // Forcer le STOP après N tours
                        await handleResult(null); // On remet `null` car on n'est plus dans le context d'une interaction bouton ici
                    } else if (currentSpin === 1) {
                        // Edit 2 : Accélération des rouleaux
                        await botMessage.edit({
                            embeds: [renderFrame(['🪙', '⬛', '⚪'], "Accélération des rouleaux...")],
                            components: [stopRow]
                        }).catch(()=>null);
                    } else if (currentSpin === 2) {
                        // Edit 3 : Analyse
                        await botMessage.edit({
                            embeds: [renderFrame(['⚪', '💎', '⬛'], "Analyse des probabilités en cours...")],
                            components: [stopRow]
                        }).catch(()=>null);
                    }
                }, TIMEOUT_MS);

            } else if (i.customId === 'slot_stop') {
                if (!isSpinning || isStopped) return;
                
                // Petit effet de freinage
                await i.update({
                    embeds: [renderFrame(['⬛', '⬛', '⬛'], "Freinage des rouleaux...")],
                    components: [] // On désactive le bouton stop
                }).catch(()=>null);

                // Attendre un tout petit peu puis afficher le vrai résultat calculé
                isStopped = true; // On bloque immédiatement la boucle d'interval logic au dessus
                setTimeout(() => {
                    handleResult(null).catch(()=>null);
                }, 800);
            }
        });

        // --- Fonction Finale ---
        const handleResult = async (i) => {
            isStopped = true;
            if (spinInterval) clearInterval(spinInterval);

            // Générer le résultat final
            const finalResults = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
            
            // Calcul du gain
            let title = "⟁ RÉSULTAT ⟁";
            let desc = `🎰 [ ${finalResults[0]} | ${finalResults[1]} | ${finalResults[2]} ]\n\n`;
            let color = COLORS.PRIMARY; // #FFFFFF par défaut

            let gain = 0;
            // ⬛ (Noir) = Jackpot symbol for "Le Secteur"
            const isJackpot = finalResults[0] === '⬛' && finalResults[1] === '⬛' && finalResults[2] === '⬛';
            const isPair = (finalResults[0] === finalResults[1]) || (finalResults[1] === finalResults[2]) || (finalResults[0] === finalResults[2]);

            if (isJackpot) {
                gain = 1000000;
                title = "⟁ JACKPOT DÉTECTÉ ⟁";
                desc += `Félicitations Admin.\nGain : ${formatCoins(gain)}\nStatut : Le Secteur domine le hasard.`;
            } else if (finalResults[0] === finalResults[1] && finalResults[1] === finalResults[2]) {
                // Autre brelan (3x identique mais pas '⬛')
                gain = 50000;
                desc += `Trois symboles identiques.\nGain : ${formatCoins(gain)}`;
            } else if (isPair) {
                gain = 5000;
                desc += `Paire obtenue.\nGain : ${formatCoins(gain)}`;
            } else {
                desc += `Aucune combinaison.\nStatut : Perte de la mise.`;
            }

            // Update user balance natively without emitting an achievement strictly, as it's an admin test command
            if (gain > 0) {
                await db.updateBalance(message.author.id, gain, 'Admin: Test Machine Win');
            }

            const finalEmbed = createEmbed(title, desc, color);

            // Rendu final via la dernière interaction si dispo, sinon via le botMessage (ex: cas du timeout des 3 tours sans clic)
            try {
                if (i && !i.replied && !i.deferred) {
                    await i.update({ embeds: [finalEmbed], components: [] }).catch(()=>null);
                } else {
                    await botMessage.edit({ embeds: [finalEmbed], components: [] }).catch(()=>null);
                }
            } catch (err) {
                // Ignore DiscordAPIError if message was deleted
            }

            collector.stop('finished');
        };

        collector.on('end', (collected, reason) => {
            if (reason === 'time' && !isStopped) {
                botMessage.edit({ components: [] }).catch(() => null);
            }
            if (spinInterval && !isStopped) {
                clearInterval(spinInterval);
            }
        });
    }
};
