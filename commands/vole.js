const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');

module.exports = {
    name: 'vole',
    description: 'Tente de voler un utilisateur',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const now = Date.now();
        const cooldown = 2 * 60 * 60 * 1000; // 2 hours

        const lastVoleTime = BigInt(user.last_vole || 0);
        if (BigInt(now) - lastVoleTime < BigInt(cooldown)) {
            const remaining = BigInt(cooldown) - (BigInt(now) - lastVoleTime);
            const hours = Number(remaining / BigInt(60 * 60 * 1000));
            const minutes = Number((remaining % BigInt(60 * 60 * 1000)) / BigInt(60 * 1000));
            
            return message.reply({ 
                embeds: [createEmbed('Pas si vite ! 🖐️', `Vous devez attendre **${hours}h ${minutes}m** avant de pouvoir voler à nouveau.`, COLORS.ERROR)]
            });
        }

        let target = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;

        if (!target && rawId) {
            try {
                target = await message.client.users.fetch(rawId);
            } catch (e) {}
        }

        if (!target || target.id === message.author.id || target.bot) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;vole @user/ID\` (Vous ne pouvez pas vous voler vous-même ou voler un bot)`, COLORS.ERROR)]
            });
        }

        const targetData = await db.getUser(target.id);

        const targetMember = await message.guild.members.fetch(target.id).catch(() => null);
        
        // 🛡️ BOUCLIER NOUVEAU VENU (48h)
        if (targetMember) {
            const TWO_DAYS = 48 * 60 * 60 * 1000;
            const joinedAt = targetMember.joinedTimestamp;
            
            if (Date.now() - joinedAt < TWO_DAYS) {
                 return message.reply({ 
                    embeds: [createEmbed('Cible protégée 🛡️', `Le bouclier "Nouveau Venu" protège **${target.username}** car il est sur le serveur depuis moins de 48 heures.`, COLORS.ERROR)]
                });
            }
        }
        
        // --- ÉVÉNEMENT VOL DE GÉNIE ---
        let bypassImmunity = false;
        let bonusMultiplier = 1.0;

        const genieResult = await eventsManager.triggerVolDeGenie(message, db, target);
        
        if (genieResult.triggered) {
            if (genieResult.success) {
                bypassImmunity = true;
                bonusMultiplier = 1.1; // +10% gain
            } else {
                // Echec : Amende et arrêt du vol
                const fine = 50n;
                const userBal = BigInt(user.balance);
                
                if (userBal >= fine) {
                    await db.updateBalance(message.author.id, -fine, 'Vol: Amende');
                    return message.channel.send({ 
                        embeds: [createEmbed('Vol avorté 👮', `Vous avez échoué au test de sécurité ! Vous payez une amende de ${formatCoins(fine)}.`, COLORS.ERROR)]
                    });
                } else {
                    // If they can't pay, set to 0 (or just take what they have)
                    await db.updateBalance(message.author.id, -userBal, 'Vol: Confiscation');
                    return message.channel.send({ 
                        embeds: [createEmbed('Vol avorté 👮', `Vous avez échoué au test de sécurité ! Vous n'avez pas de quoi payer l'amende, mais vous repartez les mains vides.`, COLORS.ERROR)]
                    });
                }
            }
        }
        // -----------------------------

        // Apply cooldown here, only if we proceed to actual robbery attempt
        await db.updateVole(message.author.id, now);

        if (targetMember) {
            const immunityRoles = [
                '1470934040692392008', // 2H
                '1470934642998644826', // 6H
                '1470934696085946561'  // 24H
            ];

            // 1. Check if they have the role on Discord
            const activeImmunityRole = immunityRoles.find(roleId => targetMember.roles.cache.has(roleId));

            if (activeImmunityRole && !bypassImmunity) {
                // 2. Double check in DB if it hasn't expired yet (since cleanup is every 15m)
                const now = Date.now();
                const expiration = await db.getRoleExpiration(target.id, activeImmunityRole);

                // If we have an expiration in DB, check it. 
                // If NO expiration in DB but they HAVE the role, we protect them anyway (safety first).
                if (expiration) {
                    const expiresAt = parseInt(expiration.expires_at);
                    if (now < expiresAt) {
                        return message.reply({ 
                            embeds: [createEmbed('Immunité 🛡️', `Cet utilisateur est immunisé contre les vols !`, COLORS.ERROR)]
                        });
                    } else {
                        // Role is expired but not yet removed by the 15m interval
                        await targetMember.roles.remove(activeImmunityRole).catch(() => {});
                        await db.removeRoleExpiration(target.id, activeImmunityRole);
                    }
                } else {
                    // Safety: They have the role but no DB entry. We protect them.
                    return message.reply({ 
                        embeds: [createEmbed('Immunité 🛡️', `Cet utilisateur est immunisé contre les vols !`, COLORS.ERROR)]
                    });
                }
            }
        }

        if (BigInt(targetData.balance) < 50n) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Cet utilisateur est trop pauvre pour être volé !`, COLORS.ERROR)]
            });
        }

        const stealPct = Math.floor((Math.random() * 0.2 + 0.1) * 100);
        let stealAmount = (BigInt(targetData.balance) * BigInt(stealPct)) / 100n;
        
        // Apply bonus from Vol de Génie
        if (bonusMultiplier > 1.0) {
            stealAmount = (stealAmount * 110n) / 100n; // 1.1 multiplier
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('stop_robbery')
                .setLabel('ARRETER LE VOL')
                .setStyle(ButtonStyle.Danger)
        );

        const channelEmbed = createEmbed(
            '⚠️ Tentative de Vol !',
            `**${message.author.username}** tente de voler **${target.username}** !\n\n` +
            `Victime, vous avez **20 secondes** pour cliquer sur le bouton ci-dessous pour arrêter le voleur !`,
            COLORS.VIOLET
        );

        const mainMsg = await message.channel.send({ 
            content: `<@${target.id}>`,
            embeds: [channelEmbed],
            components: [row]
        });

        try {
            const dmEmbed = createEmbed(
                '🚨 ON VOUS VOLE !',
                `⚠️ **${message.author.username}** est en train de vous dévaliser !\n\n` +
                `📍 [CLIQUEZ ICI POUR ACCÉDER AU SALON](${mainMsg.url})\n\n` +
                `Vous avez exactement **20 secondes** pour appuyer sur **ARRETER LE VOL** !`,
                COLORS.ERROR
            );
            await target.send({ embeds: [dmEmbed] });
        } catch (e) {}

        const collector = mainMsg.createMessageComponentCollector({ 
            filter: i => i.user.id === target.id && i.customId === 'stop_robbery',
            time: 20000 
        });

        let stopped = false;
        collector.on('collect', async i => {
            stopped = true;
            collector.stop();
            await i.update({ 
                content: null,
                embeds: [createEmbed('Vol échoué 🛡️', `**${target.username}** a été plus rapide ! Le vol est annulé.`, COLORS.SUCCESS)],
                components: [] 
            });
        });

        collector.on('end', async () => {
            if (!stopped) {
                try {
                    // Update message to show processing to the user
                    await mainMsg.edit({ 
                        components: [], 
                        embeds: [createEmbed('⚠️ Analyse du vol...', `Calcul du butin final en cours...`, COLORS.VIOLET)] 
                    }).catch(() => {});

                    const latestTarget = await db.getUser(target.id);
                    if (!latestTarget) {
                        return mainMsg.edit({ 
                            embeds: [createEmbed('Vol échoué ❌', `Impossible de localiser la victime.`, COLORS.ERROR)]
                        }).catch(() => {});
                    }

                    const targetBalance = BigInt(latestTarget.balance || 0);
                    // Crucial: ensure stealAmount is BigInt for comparison
                    const finalSteal = BigInt(stealAmount) > targetBalance ? targetBalance : BigInt(stealAmount);
                    
                    if (finalSteal > 0n) {
                        await db.updateBalance(target.id, -finalSteal, 'Vol: Victime');
                        await db.updateBalance(message.author.id, finalSteal, 'Vol: Butin');

                        await mainMsg.edit({ 
                            embeds: [createEmbed('Vol réussi! 💰', `**${message.author.username}** a réussi à voler ${formatCoins(finalSteal)} à **${target.username}** !`, COLORS.ERROR)]
                        });
                    } else {
                        await mainMsg.edit({ 
                            embeds: [createEmbed('Vol échoué ❌', `La victime n'a plus rien en poche !`, COLORS.ERROR)]
                        });
                    }
                } catch (err) {
                    console.error("[Vole] Erreur fatale dénouement:", err);
                    await mainMsg.edit({ 
                        embeds: [createEmbed('Erreur Système', `Une défaillance technique a empêché le calcul du butin.`, COLORS.ERROR)]
                    }).catch(() => {});
                }
            }
        });
    }
};
