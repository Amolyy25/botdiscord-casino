const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'primeinfo',
    description: 'Afficher les informations d\'une prime ou d\'un utilisateur (Admin seulement)',
    async execute(message, args, db) {
        // Check Admin permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ 
                content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
                flags: 64 
            });
        }

        if (args.length < 1) {
            return message.reply('❌ Usage: `;primeinfo <id_prime | @user>`');
        }

        const input = args[0];
        
        // Check if input is a User mention or ID
        // Mentions look like <@123456> or <@!123456>
        const userIdMatch = input.match(/^<@!?(\d+)>$/);
        const userId = userIdMatch ? userIdMatch[1] : (input.match(/^\d{17,19}$/) ? input : null);

        if (userId) {
            // Fetch User info
            try {
                // We use DB to get bounties even if user object fetch fails (though message.guild.members.fetch is better for names)
                const userBountiesAuthored = await db.getBountiesByAuthor(userId);
                const userBountiesWon = await db.getBountiesByWinner(userId);

                let memberName = userId;
                try {
                    const member = await message.guild.members.fetch(userId);
                    memberName = member.user.username;
                } catch (e) {
                    // ID exists in DB but maybe not in server anymore
                }

                // Format Authored
                let authoredField = 'Aucune prime lancée.';
                if (userBountiesAuthored.length > 0) {
                    authoredField = userBountiesAuthored.map(b => 
                        `**#${b.id}** - ${b.title.substring(0, 20)}... (${b.status})`
                    ).join('\n');
                }

                // Format Won
                let wonField = 'Aucune prime complétée.';
                if (userBountiesWon.length > 0) {
                    wonField = userBountiesWon.map(b => 
                        `**#${b.id}** - ${b.title.substring(0, 20)}... (+${formatCoins(b.reward)})`
                    ).join('\n');
                }

                const embed = createEmbed(
                    `📂 Dossier Primes : ${memberName}`,
                    `Informations pour l'utilisateur <@${userId}>`,
                    COLORS.PRIMARY
                );

                embed.addFields(
                    { name: '📝 Primes Lancées', value: authoredField, inline: true },
                    { name: '🏆 Primes Complétées', value: wonField, inline: true }
                );

                return message.reply({ embeds: [embed] });

            } catch (error) {
                console.error(error);
                return message.reply('❌ Erreur lors de la récupération des infos utilisateur.');
            }
        } 
        
        // Otherwise treat as Bounty ID
        const bountyId = input.replace('#', '');
        
        // Basic check if numeric
        if (!/^\d+$/.test(bountyId)) {
             return message.reply('❌ ID invalide. Utilisez un ID de prime (ex: 1) ou mentionnez un membre.');
        }

        try {
            const bounty = await db.getBounty(bountyId);

            if (!bounty) {
                return message.reply('❌ Prime introuvable.');
            }

            const statusEmoji = bounty.status === 'active' ? '🟢' : (bounty.status === 'closed' ? '🔴' : '⚫');
            const winnerText = bounty.winner_id ? `<@${bounty.winner_id}>` : 'Aucun';
            
            const embed = createEmbed(
                `📄 Détails de la Prime #${bounty.id}`,
                `**Titre :** ${bounty.title}\n` +
                `**Statut :** ${statusEmoji} ${bounty.status.toUpperCase()}`,
                bounty.status === 'active' ? COLORS.SUCCESS : COLORS.ERROR
            );

            embed.addFields(
                { name: '👤 Auteur', value: `<@${bounty.author_id}>`, inline: true },
                { name: '💰 Récompense', value: formatCoins(bounty.reward), inline: true },
                { name: '🏆 Gagnant', value: winnerText, inline: true },
                { name: '📝 Description', value: bounty.description },
                { name: '📅 Date de création', value: new Date(bounty.created_at).toLocaleString('fr-FR') }
            );

            message.reply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            message.reply('❌ Erreur lors de la récupération de la prime.');
        }
    }
};
