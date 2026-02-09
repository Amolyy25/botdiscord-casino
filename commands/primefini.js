const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'primefini',
    description: 'Terminer une prime et payer le gagnant (Admin uniquement)',
    async execute(message, args, db) {
        // Check permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return;
        }

        if (args.length < 2) {
            return message.reply('❌ Usage: `;primefini <id_prime> <id_gagnant>`');
        }

        const bountyId = args[0].replace('#', '');
        const winnerId = args[1].replace(/[<@!>]/g, ''); // Handle mention or ID

        try {
            const bounty = await db.getBounty(bountyId);

            if (!bounty) {
                return message.reply('❌ Prime introuvable.');
            }

            if (bounty.status !== 'active') {
                return message.reply('❌ Cette prime n\'est plus active.');
            }

            // Transfer reward to winner (Coins were already deducted from author, so we just add to winner)
            // Wait, where did the coins go? "Le bot prélève le montant".
            // Since there is no central bank account mentioned, I assume the coins just "vanished" and now we mint them for the winner?
            // OR I should have transferred them to a "bot account"?
            // The prompt says "Transfère les coins au gagnant en DB".
            // Since I deducted them from author, simple "updateBalance(winner, +reward)" effectively transfers them (system held them).
            
            await db.updateBalance(winnerId, bounty.reward);

            // Close bounty
            await db.closeBounty(bounty.id, winnerId);

            message.reply(`✅ Prime #${bounty.id} terminée ! <@${winnerId}> a reçu ${formatCoins(bounty.reward)}.`);

            // Update Board Message
            const boardChannelId = await db.getConfig('prime_board_channel');
            const boardChannel = message.guild.channels.cache.get(boardChannelId);

            if (boardChannel && bounty.message_id) {
                try {
                    const boardMsg = await boardChannel.messages.fetch(bounty.message_id);
                    if (boardMsg) {
                        const oldEmbed = boardMsg.embeds[0];
                        const newEmbed = createEmbed(
                            oldEmbed.title + ' [TERMINÉE]',
                            oldEmbed.description + `\n\n🏆 **Gagnée par :** <@${winnerId}>`,
                            COLORS.SUCCESS // Green for finished
                        );
                        
                        // Remove button or disable it
                         const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                         const row = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`accept_bounty_${bounty.id}`)
                                    .setLabel('Terminée')
                                    .setStyle(ButtonStyle.Secondary)
                                    .setEmoji('🏆')
                                    .setDisabled(true)
                            );

                        await boardMsg.edit({ embeds: [newEmbed], components: [row] });
                        
                        // Celebrate
                        await boardChannel.send(`🎉 Félicitations à <@${winnerId}> qui a remporté la prime **${bounty.title}** (${formatCoins(bounty.reward)}) !`);
                    }
                } catch (e) {
                    console.error('Could not update board message:', e);
                }
            }

        } catch (error) {
            console.error(error);
            message.reply('❌ Erreur lors de la finalisation de la prime.');
        }
    }
};
