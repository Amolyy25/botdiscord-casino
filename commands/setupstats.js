const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'setupstats',
    description: 'Configure le classement de fortune dynamique (Admin)',
    async execute(message, args, db) {
        // Admin only
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({
                embeds: [{
                    title: 'Accès refusé',
                    description: 'Seuls les administrateurs peuvent utiliser cette commande.',
                    color: 0xf04747
                }]
            });
        }

        try {
            // Build the initial leaderboard embed
            const embed = new EmbedBuilder()
                .setTitle('CLASSEMENT FORTUNE | LE SECTEUR')
                .setDescription(
                    '```\n[SYSTEM] Initialisation du classement...\nChargement des données en cours.\n```'
                )
                .setColor('#FFFFFF')
                .setFooter({ text: 'Le capital définit l\'influence. Mis à jour chaque heure.' })
                .setTimestamp();

            // Send the persistent message to the current channel
            const panelMessage = await message.channel.send({ embeds: [embed] });

            // Persist config to DB
            await db.setFortuneLeaderboardConfig(
                message.guild.id,
                message.channel.id,
                panelMessage.id
            );

            // Confirm to admin
            await message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ Classement Fortune configuré')
                    .setDescription(
                        `Le panneau de classement a été créé dans ce salon.\n\n` +
                        `• **Salon :** ${message.channel}\n` +
                        `• **Message ID :** \`${panelMessage.id}\`\n\n` +
                        `Le classement sera mis à jour automatiquement toutes les **60 minutes**.\n` +
                        `Seuls les membres actifs au cours des **14 derniers jours** apparaîtront.`
                    )
                    .setColor(0x43b581)
                    .setTimestamp()
                ]
            });

            // Trigger an immediate first refresh
            const fortuneLeaderboard = require('../events/fortuneLeaderboard');
            await fortuneLeaderboard.refreshLeaderboard(message.client, db, message.guild.id);

        } catch (error) {
            console.error('[SetupStats] Erreur:', error);
            await message.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('Erreur')
                    .setDescription(`Une erreur est survenue : ${error.message}`)
                    .setColor(0xf04747)
                ]
            });
        }
    }
};
