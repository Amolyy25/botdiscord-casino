const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS } = require('../utils');

const CASINO_CHAT_CHANNEL_IDS = ["1469713523549540536", "1480489172082102423"];
const CASINO_ROLE_ID = "1469713522194780404";

module.exports = {
    name: 'maintenance',
    description: 'Active ou désactive la maintenance du casino (Bloque les salons)',
    async execute(message, args, db) {
        // Only allow Administrators
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({
                embeds: [createEmbed('Accès Refusé', "Tu n'as pas la permission d'utiliser cette commande.", COLORS.ERROR)],
                failIfNotExists: false
            });
        }

        const action = args[0]?.toLowerCase();

        if (action !== 'on' && action !== 'off') {
            return message.reply({
                embeds: [createEmbed('Erreur de Syntaxe', "Utilisation : `;maintenance on` ou `;maintenance off`", COLORS.ERROR)],
                failIfNotExists: false
            });
        }

        let channelsProcessed = 0;

        for (const channelId of CASINO_CHAT_CHANNEL_IDS) {
            const channel = message.guild.channels.cache.get(channelId);
            if (!channel) continue;

            try {
                if (action === 'on') {
                    // Lock channels
                    await channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false }); // @everyone
                    await channel.permissionOverwrites.edit(CASINO_ROLE_ID, { SendMessages: false }); // Role Casino

                    const embedLock = createEmbed(
                        '🛠️ MAINTENANCE EN COURS',
                        `Le casino est actuellement fermé pour une maintenance technique.\nNous serons de retour très bientôt !\n\n*Les terminaux textuels sont verrouillés temporairement.*`,
                        COLORS.GOLD
                    );
                    
                    await channel.send({ embeds: [embedLock] });
                } else {
                    // Unlock channels
                    await channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
                    await channel.permissionOverwrites.edit(CASINO_ROLE_ID, { SendMessages: true }); // Usually casino role needs to send messages

                    const embedUnlock = createEmbed(
                        '✅ MAINTENANCE TERMINÉE',
                        `Le casino est de nouveau opérationnel !\nBon jeu à tous ! 🎰`,
                        COLORS.SUCCESS
                    );
                    
                    await channel.send({ embeds: [embedUnlock] });
                }
                channelsProcessed++;
            } catch (err) {
                console.error(`[Maintenance] Erreur pour le salon ${channelId}:`, err);
            }
        }

        const replyEmbed = createEmbed(
            'Succès',
            `La maintenance a bien été **${action === 'on' ? 'activée' : 'désactivée'}** dans ${channelsProcessed} salon(s).`,
            COLORS.SUCCESS
        );

        await message.reply({ embeds: [replyEmbed], failIfNotExists: false });
    }
};
