const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS } = require('../utils');
const eventsManager = require('../events/eventsManager');

module.exports = {
    name: 'hdg',
    description: 'Active manuellement l\'Heure de Gloire (Admin)',
    async execute(message, args, db) {
        // Restriction aux administrateurs
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Permission insuffisante. Seuls les administrateurs peuvent utiliser cette commande.`, COLORS.ERROR)]
            });
        }

        let durationMin = parseInt(args[0]);
        let durationMs = null;

        if (!isNaN(durationMin) && durationMin > 0) {
            durationMs = durationMin * 60 * 1000;
        } else if (args[0]) {
            // Si un argument est fourni mais n'est pas un nombre valide
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;hdg [temps en minutes]\` (par défaut 20)`, COLORS.ERROR)]
            });
        }

        try {
            await eventsManager.startGloryHour(message.client, db, durationMs);
            
            const actualDuration = durationMin || 20;
            const embed = createEmbed(
                'Heure de Gloire : Activation Manuelle ⚡',
                `L'Heure de Gloire a été activée pour **${actualDuration} minutes**.`,
                COLORS.SUCCESS
            );
            
            message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('[HDG Command] Erreur:', error);
            message.reply({ 
                embeds: [createEmbed('Erreur', `Une erreur est survenue lors de l'activation de l'Heure de Gloire.`, COLORS.ERROR)]
            });
        }
    }
};
