require('dotenv').config();
const { Client, GatewayIntentBits, Collection, InteractionResponseType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const { COLORS, createEmbed } = require('./utils');

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
});

client.login(process.env.TOKEN);
