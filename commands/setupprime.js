const { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, COLORS } = require('../utils');

module.exports = {
    name: 'setupprime',
    description: 'Configure le système de primes (Admin uniquement)',
    async execute(message, args, db) {
        // Check permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ 
                content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
                flags: 64 
            });
        }

        const boardChannelId = args[0] ? args[0].replace(/[<#>]/g, '') : null;

        if (!boardChannelId) {
            return message.reply('❌ Usage: `;setupprime <ID_salon_tableau>`\nLancez cette commande dans le salon d\'entrée (Menu).');
        }

        const boardChannel = message.guild.channels.cache.get(boardChannelId);
        if (!boardChannel) {
            return message.reply('❌ Le salon du tableau est introuvable.');
        }

        try {
            // Save config
            await db.setConfig('prime_entrance_channel', message.channel.id);
            await db.setConfig('prime_board_channel', boardChannelId);

            // Create Entrace Embed
            const embed = createEmbed(
                '💵 Tableau de Bord des Primes',
                'Bienvenue dans l\'espace des primes !\n\n' +
                'Ici, vous pouvez proposer des défis ou des tâches rémunérées en coins.\n' +
                'Cliquez sur le bouton ci-dessous pour ouvrir un dossier de proposition.\n\n' +
                '**Une fois validée, votre prime apparaîtra dans le salon** ' + `<#${boardChannelId}>` + '.',
                COLORS.GOLD
            );

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('propose_bounty')
                        .setLabel('Proposer une Prime')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('💵')
                );

            await message.channel.send({ embeds: [embed], components: [row] });
            await message.delete().catch(() => {});

        } catch (error) {
            console.error(error);
            message.reply('❌ Une erreur est survenue lors de la configuration.');
        }
    }
};
