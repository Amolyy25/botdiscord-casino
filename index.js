require('dotenv').config();
const { Client, GatewayIntentBits, Collection, InteractionResponseType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const { COLORS, createEmbed, formatCoins } = require('./utils');
const mathQuiz = require('./events/mathQuiz');
const roleExpiration = require('./events/roleExpiration');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
const prefix = process.env.PREFIX || ';';
const CASINO_CHAT_CHANNEL_ID = '1469713523549540536';

// Load commands
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.name, command);
}

client.once('clientReady', async () => {
    try {
        await db.initDb();
        console.log('Database initialized');

        // Init Math Quiz System
        await mathQuiz.init(client, db);

        // Init Role Expiration System
        await roleExpiration.init(client, db);

    } catch (err) {
        console.error('Failed to initialize database:', err);
    }
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);

    if (!command) return;

    // Check channel restriction (skip for DMs)
    if (message.guild) {
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
        const isCasinoChannel = message.channel.id === CASINO_CHAT_CHANNEL_ID;

        if (!isAdmin && !isCasinoChannel) {
            try {
                await message.delete().catch(() => {});
                
                const dmEmbed = createEmbed(
                    'Transformation de salon ⚠️',
                    `Merci d'utiliser les commandes du casino uniquement dans le salon <#${CASINO_CHAT_CHANNEL_ID}> pour éviter de polluer le chat général.`,
                    COLORS.ERROR
                );
                
                await message.author.send({ embeds: [dmEmbed] }).catch(() => {});
            } catch (e) {
                // Ignore errors (e.g. missing permissions)
            }
            return;
        }
    }

    try {
        await command.execute(message, args, db);
    } catch (error) {
        console.error(error);
        const errorEmbed = createEmbed('Erreur', 'Une erreur est survenue lors de l\'exécution de cette commande.', COLORS.ERROR);
        message.reply({ embeds: [errorEmbed] }).catch(() => {});
    }
});

// Handle button interactions for casino access
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'access_casino') {
        try {
            const casinoRole = interaction.guild.roles.cache.find(r => r.name === 'Casino');
            
            if (!casinoRole) {
                return interaction.reply({ 
                    content: '❌ Le rôle Casino n\'a pas été trouvé. Contactez un administrateur.',
                    flags: 64 // EPHEMERAL flag
                });
            }

            const member = interaction.member;

            if (member.roles.cache.has(casinoRole.id)) {
                return interaction.reply({ 
                    content: '✅ Vous avez déjà accès au casino !',
                    flags: 64 // EPHEMERAL flag
                });
            }

            await member.roles.add(casinoRole);

            const embed = createEmbed(
                '🎰 Accès accordé !',
                `Bienvenue au casino ! Vous pouvez maintenant accéder au salon de jeu.\n\n` +
                `Tapez \`;help\` pour voir toutes les commandes disponibles.\n\n` +
                `**Bonne chance ! 🍀**`,
                COLORS.SUCCESS
            );

            await interaction.reply({ embeds: [embed], flags: 64 }); // EPHEMERAL flag

        } catch (error) {
            console.error('Error granting casino access:', error);
            interaction.reply({ 
                content: '❌ Une erreur est survenue. Contactez un administrateur.',
                flags: 64 // EPHEMERAL flag
            }).catch(() => {});
        }
    }

    // Bounty System Interactions
    if (interaction.customId === 'propose_bounty') {
        const categoryId = '1469071692172361836';
        const casinoRoleId = '1469713522194780404';

        try {
            const safeUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
            const channelName = `prime-prop-${safeUsername}`;
            const channel = await interaction.guild.channels.create({
                name: channelName,
                type: 0, // GUILD_TEXT
                parent: categoryId,
                topic: `Bounty Author: ${interaction.user.id}`,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    },
                    {
                        id: '1469071689848721510', // Staff Role
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    }
                ],
            });

            const embed = createEmbed(
                '📝 Proposition de Prime',
                `Bonjour <@${interaction.user.id}> !\n\n` +
                `Décrivez votre proposition de prime ici (Titre, Description, Récompense).\n` +
                `Un administrateur viendra valider et lancer la commande \`;prime\`.\n\n` +
                `*Ce ticket se fermera une fois la prime validée.*`,
                COLORS.PRIMARY
            );

            await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });

            interaction.reply({ content: `✅ Ticket créé : ${channel}`, flags: 64 });

        } catch (error) {
            console.error('Error creating proposal ticket:', error);
            interaction.reply({ content: '❌ Erreur lors de la création du ticket. Vérifiez mes permissions.', flags: 64 }).catch(() => {});
        }
    }

    if (interaction.customId.startsWith('accept_bounty_')) {
        const bountyId = interaction.customId.split('_')[2];
        const categoryId = '1469071692172361836';
        const casinoRoleId = '1469713522194780404';

        try {
            const bounty = await db.getBounty(bountyId);
            if (!bounty || bounty.status !== 'active') {
                return interaction.reply({ content: '❌ Cette prime n\'est plus disponible.', flags: 64 });
            }

            if (bounty.author_id === interaction.user.id) {
                 return interaction.reply({ content: '❌ Vous ne pouvez pas accepter votre propre prime.', flags: 64 });
            }

            const safeUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
            const channelName = `preuve-${bountyId}-${safeUsername}`;
            const channel = await interaction.guild.channels.create({
                name: channelName,
                type: 0, // GUILD_TEXT
                parent: categoryId,
                topic: `Bounty Proof: ${bountyId} | User: ${interaction.user.id}`,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    },
                    {
                        id: '1469071689848721510', // Staff Role
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    }
                ],
            });

            const embed = createEmbed(
                `🕵️ Preuve pour la Prime #${bountyId}`,
                `Vous avez accepté la prime : **${bounty.title}**\n\n` +
                `Envoyez ici la preuve de votre réalisation (Screenshot, lien, etc.).\n` +
                `Un administrateur validera avec \`;primefini\` pour vous transférer les **${formatCoins(bounty.reward)}**.\n\n` +
                `*Bonne chance !*`,
                COLORS.VIOLET
            );

            await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });

            interaction.reply({ content: `✅ Ticket de preuve ouvert : ${channel}`, flags: 64 });

        } catch (error) {
            console.error('Error creating proof ticket:', error);
            interaction.reply({ content: `❌ Erreur lors de l'ouverture du ticket : ${error.message}`, flags: 64 }).catch(() => {});
        }
    }
});

client.login(process.env.TOKEN);
