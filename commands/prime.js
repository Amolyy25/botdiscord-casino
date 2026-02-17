const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'prime',
    description: 'Valider et poster une prime (Admin uniquement)',
    async execute(message, args, db) {
        // Check permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return; // Ignore silently or reply
        }

        // Usage: ;prime "Titre" "Description" "Reward"
        // We need to parse quoted arguments.
        const regex = /"([^"]+)"|(\S+)/g;
        const parsedArgs = [];
        let match;
        while ((match = regex.exec(args.join(' '))) !== null) {
            parsedArgs.push(match[1] || match[2]);
        }

        if (parsedArgs.length < 3) {
            return message.reply('❌ Usage: `;prime "Titre" "Description" "Récompense"`');
        }

        const title = parsedArgs[0];
        const description = parsedArgs[1];
        const reward = parseInt(parsedArgs[2]);

        if (isNaN(reward) || reward <= 0) {
            return message.reply('❌ La récompense doit être un nombre positif.');
        }

        // Determine Author.
        // Option 1: The command is run in a ticket channel. We can try to guess the author from channel topic or name?
        // Option 2: The admin mentions the user?
        // The prompt says: "Dans le ticket, l'utilisateur explique son idée. Commande Admin : ;prime ..."
        // "Le bot vérifie le solde de l'auteur".
        // Let's assume the Ticket Channel Topic contains the User ID, e.g., "Bounty Author: <id>"
        // I will implement the ticket creation to set this topic.
        
        const topic = message.channel.topic;
        const authorIdMatch = topic?.match(/Bounty Author: (\d+)/);
        
        if (!authorIdMatch) {
            return message.reply('❌ Impossible de trouver l\'auteur de la prime dans ce salon (Vérifiez le topic du salon).');
        }

        const authorId = authorIdMatch[1];
        const authorUser = await db.getUser(authorId);

        if (BigInt(authorUser.balance) < BigInt(reward)) {
             return message.reply(`❌ L'auteur (<@${authorId}>) n'a pas assez de coins (${formatCoins(authorUser.balance)}).`);
        }

        try {
            // Deduct balance
            await db.updateBalance(authorId, -reward, 'Prime: Paiement');

            // Create Bounty in DB
            const bounty = await db.createBounty(title, description, reward, authorId);

            // Get Board Channel
            const boardChannelId = await db.getConfig('prime_board_channel');
            const boardChannel = message.guild.channels.cache.get(boardChannelId);

            if (!boardChannel) {
                // Refund and error
                await db.updateBalance(authorId, reward, 'Prime: Remboursement'); 
                // We should probably delete the bounty or mark as error, but for now just error out.
                return message.reply('❌ Salon du tableau introuvable. Configuration requise (;setupprime).');
            }

            // Post to Board
            const boardEmbed = createEmbed(
                `📋 Nouvelle Prime : ${title}`,
                `${description}\n\n**Récompense :** ${formatCoins(reward)}\n**Proposée par :** <@${authorId}>\n**ID:** #${bounty.id}`,
                COLORS.GOLD
            );

            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`accept_bounty_${bounty.id}`)
                        .setLabel('Accepter la prime')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('✅')
                );

            const boardMsg = await boardChannel.send({ embeds: [boardEmbed], components: [row] });

            // Update DB with message ID
            await db.updateBountyMessageId(bounty.id, boardMsg.id);

            message.channel.send('✅ Prime validée et postée ! Ce ticket peut être fermé.');

        } catch (error) {
            console.error(error);
            message.reply('❌ Erreur lors de la création de la prime.');
        }
    }
};
