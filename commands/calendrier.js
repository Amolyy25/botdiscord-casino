const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS } = require('../utils');
const calendarManager = require('../events/calendarManager');

module.exports = {
    name: 'calendrier',
    aliases: ['cal'],
    description: 'Voir et gérer le calendrier des événements (Admin seulement)',
    async execute(message, args, db) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({
                embeds: [createEmbed('Erreur', 'Cette commande est réservée aux administrateurs.', COLORS.ERROR)]
            });
        }

        const events = await calendarManager.getAllEvents(db);
        const embed = calendarManager.buildCalendarEmbed(events);
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cal_refresh')
                .setLabel('Actualiser')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('cal_postpone_all')
                .setLabel('Tout décaler à demain')
                .setEmoji('⏩')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('cal_edit')
                .setLabel('Modifier un event')
                .setEmoji('✏️')
                .setStyle(ButtonStyle.Success)
        );

        await message.reply({
            embeds: [embed],
            components: [row]
        });
    }
};
