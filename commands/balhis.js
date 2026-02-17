const { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'balhis',
    description: 'Affiche l\'historique des transactions d\'un utilisateur (Admin)',
    async execute(message, args, db) {
        // Restricted to admins
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', 'Cette commande est réservée aux administrateurs.', COLORS.ERROR)]
            });
        }

        let target = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;

        if (!target && rawId) {
            try {
                target = await message.client.users.fetch(rawId);
            } catch (e) {
                // If not found, we still use the ID to query the DB
                target = { id: rawId, tag: rawId, username: rawId };
            }
        }

        if (!target) {
            target = message.author;
        }

        const userData = await db.getUser(target.id);
        const limit = 15;
        let currentPage = 1;

        async function getPage(page) {
            const offset = (page - 1) * limit;
            const { rows, total } = await db.getBalanceHistory(target.id, limit, offset);
            
            if (rows.length === 0) {
                return { embed: createEmbed('Historique des Transactions', `Aucune transaction trouvée pour **${target.username || target.tag}**.`, COLORS.PRIMARY), totalPages: 0 };
            }

            const totalPages = Math.ceil(total / limit);
            
            let description = '';
            for (const row of rows) {
                const date = new Date(parseInt(row.created_at));
                const timeStr = date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                const prefix = parseInt(row.amount) >= 0 ? '+' : '';
                
                description += `\`${timeStr}\` | **${prefix}${row.amount.toLocaleString('fr-FR')}** | ${row.reason}\n`;
            }

            const embed = createEmbed(
                `Historique : ${target.username || target.tag}`,
                description,
                COLORS.PRIMARY
            );

            embed.setFooter({ 
                text: `Page ${page}/${totalPages} | Solde actuel : ${formatCoins(userData.balance)}` 
            });

            return { embed, totalPages };
        }

        const { embed, totalPages } = await getPage(currentPage);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 1),
            new ButtonBuilder()
                .setCustomId('next')
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(totalPages <= 1)
        );

        const reply = await message.reply({ 
            embeds: [embed], 
            components: totalPages > 1 ? [row] : [] 
        });

        if (totalPages <= 1) return;

        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: 'Seul l\'auteur de la commande peut naviguer.', flags: 64 });
            }

            if (i.customId === 'prev') {
                currentPage--;
            } else if (i.customId === 'next') {
                currentPage++;
            }

            const { embed: nextEmbed } = await getPage(currentPage);
            
            const nextRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setEmoji('⬅️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setEmoji('➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages)
            );

            await i.update({ embeds: [nextEmbed], components: [nextRow] });
        });

        collector.on('end', () => {
            reply.edit({ components: [] }).catch(() => {});
        });
    }
};
