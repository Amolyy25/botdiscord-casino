const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'closeprime',
    description: 'Annuler et supprimer une prime (Admin/Staff uniquement)',
    async execute(message, args, db) {
        const STAFF_ROLE_ID = '1469071689848721510';
        
        // Check permissions: Admin OR Staff
        const isStaff = message.member.roles.cache.has(STAFF_ROLE_ID);
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isStaff && !isAdmin) {
            return message.reply({ 
                content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
                flags: 64 
            });
        }

        if (args.length < 1) {
            return message.reply('❌ Usage: `;closeprime <id_prime>`');
        }

        const bountyId = args[0].replace('#', '');

        try {
            const bounty = await db.getBounty(bountyId);

            if (!bounty) {
                return message.reply('❌ Prime introuvable.');
            }

            if (bounty.status !== 'active') {
                return message.reply('❌ Cette prime n\'est pas active (déjà fermée ou terminée).');
            }

            // Refund Author (since this is cancellation, not completion)
            if (bounty.author_id) {
                await db.updateBalance(bounty.author_id, bounty.reward);
            }

            // Close bounty in DB
            // We can reuse closeBounty but with 'cancellation' as winner? Or just mark status 'closed'.
            // The existing closeBounty sets a winner. We should probably just update status manually here or make closeBounty more flexible.
            // Using raw query for safety to avoid setting a winner.
            // Wait, I can just use closeBounty with null winner if DB supports it, but verify database.js first.
            // Let's modify DB manually here for now or assume closeBounty(id, null) works if winner_id is nullable.
            // Looking at database.js: winner_id TEXT. So null is fine.
            
            await db.closeBounty(bounty.id, null); // Winner is null -> Cancelled.

            message.reply(`✅ Prime #${bounty.id} annulée. L'auteur <@${bounty.author_id}> a été remboursé.`);

            // Update Board Message
            const boardChannelId = await db.getConfig('prime_board_channel');
            const boardChannel = message.guild.channels.cache.get(boardChannelId);

            if (boardChannel && bounty.message_id) {
                try {
                    const boardMsg = await boardChannel.messages.fetch(bounty.message_id);
                    if (boardMsg) {
                        // User requested to "supprimer la prime" (delete).
                        // Let's delete the message to be clean.
                        await boardMsg.delete();
                    }
                } catch (e) {
                    console.error('Could not delete board message:', e);
                }
            }

        } catch (error) {
            console.error(error);
            message.reply('❌ Erreur lors de l\'annulation de la prime.');
        }
    }
};
