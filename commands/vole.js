const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'vole',
    description: 'Tente de voler un utilisateur',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const now = Date.now();
        const cooldown = 2 * 60 * 60 * 1000; // 2 hours

        if (now - parseInt(user.last_vole || 0) < cooldown) {
            const remaining = cooldown - (now - parseInt(user.last_vole));
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            
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
        
        // --- ÉVÉNEMENT VOL DE GÉNIE ---
        const eventsManager = require('../events/eventsManager');
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
                await db.updateBalance(message.author.id, -fine);
                return message.channel.send({ 
                    embeds: [createEmbed('Vol avorté 👮', `Vous avez échoué au test de sécurité ! Vous payez une amende de ${formatCoins(fine)}.`, COLORS.ERROR)]
                });
            }
        }
        // -----------------------------

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

        const balanceNum = Number(targetData.balance);
        let stealAmount = BigInt(Math.floor(balanceNum * (Math.random() * 0.2 + 0.1)));
        
        // Apply bonus from Vol de Génie
        if (bonusMultiplier > 1.0) {
            stealAmount = BigInt(Math.floor(Number(stealAmount) * bonusMultiplier));
        }

        await db.updateVole(message.author.id, now);

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
                const latestTarget = await db.getUser(target.id);
                const finalSteal = stealAmount > BigInt(latestTarget.balance) ? BigInt(latestTarget.balance) : stealAmount;
                
                if (finalSteal > 0n) {
                    await db.updateBalance(target.id, -finalSteal);
                    await db.updateBalance(message.author.id, finalSteal);

                    mainMsg.edit({ 
                        content: null,
                        embeds: [createEmbed('Vol réussi! 💰', `**${message.author.username}** a réussi à voler ${formatCoins(finalSteal)} à **${target.username}** !`, COLORS.ERROR)],
                        components: [] 
                    }).catch(() => {});
                } else {
                    mainMsg.edit({ 
                        content: null,
                        embeds: [createEmbed('Vol échoué ❌', `La victime n'a plus rien en poche !`, COLORS.ERROR)],
                        components: [] 
                    }).catch(() => {});
                }
            }
        });
    }
};
