const { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { createEmbed, COLORS } = require('../utils');

module.exports = {
    name: 'setupprime',
    description: 'Configure automatiquement le système de primes (Admin uniquement)',
    async execute(message, args, db) {
        // Check permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ 
                content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
                flags: 64 
            });
        }

        const CATEGORY_ID = '1469071692172361836';
        const ROLE_CASINO_ID = '1469713522194780404';

        const category = message.guild.channels.cache.get(CATEGORY_ID);
        if (!category) {
            return message.reply(`❌ La catégorie (ID: ${CATEGORY_ID}) est introuvable. Veuillez vérifier l'ID.`);
        }

        const casinoRole = message.guild.roles.cache.get(ROLE_CASINO_ID);
        if (!casinoRole) {
             return message.reply(`❌ Le rôle Casino (ID: ${ROLE_CASINO_ID}) est introuvable.`);
        }

        try {
            message.reply('⏳ Installation en cours... Création des salons...');

            // Create Entrance Channel
            const entranceChannel = await message.guild.channels.create({
                name: '│💵・Prime',
                type: ChannelType.GuildText,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: message.guild.id, // @everyone
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: ROLE_CASINO_ID,
                        allow: [PermissionFlagsBits.ViewChannel],
                        deny: [PermissionFlagsBits.SendMessages], // Read-only
                    },
                    {
                        id: message.client.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    }
                ]
            });

            // Create Board Channel
            const boardChannel = await message.guild.channels.create({
                name: '│📋・Primes-Proposées',
                type: ChannelType.GuildText,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: message.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: ROLE_CASINO_ID,
                        allow: [PermissionFlagsBits.ViewChannel],
                        deny: [PermissionFlagsBits.SendMessages], // Read-only
                    },
                     {
                        id: message.client.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    }
                ]
            });

            // Save Config
            await db.setConfig('prime_entrance_channel', entranceChannel.id);
            await db.setConfig('prime_board_channel', boardChannel.id);

            // Create Entrace Embed
            const embed = createEmbed(
                '💵 Tableau de Bord des Primes',
                'Bienvenue dans l\'espace des primes !\n\n' +
                'Ici, vous pouvez proposer des défis ou des tâches rémunérées en SCoins.\n' +
                'Cliquez sur le bouton ci-dessous pour ouvrir un dossier de proposition.\n\n' +
                '**Une fois validée, votre prime apparaîtra dans le salon** ' + `<#${boardChannel.id}>` + '.',
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

            await entranceChannel.send({ embeds: [embed], components: [row] });

            await message.channel.send(`✅ **Installation terminée avec succès !**\n\n🔹 Salon d'entrée : <#${entranceChannel.id}>\n🔹 Tableau des primes : <#${boardChannel.id}>`);

        } catch (error) {
            console.error('Error in setupprime:', error);
            message.channel.send('❌ Une erreur est survenue lors de l\'installation automatique. Vérifiez les permissions du bot et les logs console.');
        }
    }
};
