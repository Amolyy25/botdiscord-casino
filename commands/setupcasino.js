const {
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createEmbed, COLORS } = require("../utils");
const { ROLE_POOL } = require("../roleConfig");

const CASINO_CATEGORY_ID = "1469071692172361836";
const CASINO_CHANNEL_ID = "1469071692348264634";

module.exports = {
  name: "setupcasino",
  description: "Configure le système de casino (Admin)",
  async execute(message, args, db) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({
        embeds: [
          createEmbed("Erreur", `Permission insuffisante.`, COLORS.ERROR),
        ],
      });
    }

    try {
      // Get the casino channel
      const casinoChannel =
        await message.guild.channels.fetch(CASINO_CHANNEL_ID);
      if (!casinoChannel) {
        return message.reply({
          embeds: [
            createEmbed(
              "Erreur",
              `Le salon CASINO n'a pas été trouvé.`,
              COLORS.ERROR,
            ),
          ],
        });
      }

      // Check if casino-chat channel already exists
      let casinoChatChannel = message.guild.channels.cache.find(
        (ch) =>
          ch.name === "│🎰・casino-chat" && ch.parentId === CASINO_CATEGORY_ID,
      );

      let casinoRoleId;
      let channelAlreadyExists = !!casinoChatChannel;

      // Find or create casino role
      let casinoRole = message.guild.roles.cache.find(
        (r) => r.name === "Casino",
      );
      if (!casinoRole) {
        casinoRole = await message.guild.roles.create({
          name: "Casino",
          color: "#FFD700",
          reason: "Casino access role",
        });
      }
      casinoRoleId = casinoRole.id;

      if (!casinoChatChannel) {
        // Create the casino-chat channel
        casinoChatChannel = await message.guild.channels.create({
          name: "│🎰・casino-chat",
          type: ChannelType.GuildText,
          parent: CASINO_CATEGORY_ID,
          permissionOverwrites: [
            {
              id: message.guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: casinoRoleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ],
          reason: "Casino chat channel setup",
        });
      } else {
        // Update permissions if channel already exists
        await casinoChatChannel.permissionOverwrites.set([
          {
            id: message.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: casinoRoleId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ]);
      }

      // Build role probabilities display with role mentions
      let rolesDisplay = "";
      const sortedRoles = [...ROLE_POOL].sort(
        (a, b) => a.probability - b.probability,
      );

      for (const reward of sortedRoles) {
        const percentage = (reward.probability * 100).toFixed(3);
        let rarityEmoji = "🔸";
        if (reward.probability < 0.001) rarityEmoji = "💎";
        else if (reward.probability < 0.05) rarityEmoji = "⭐";
        else if (reward.probability < 0.15) rarityEmoji = "🔹";

        if (reward.type === "coins") {
          rolesDisplay += `**${reward.amount} Coins** - ${percentage}%\n`;
        } else {
          rolesDisplay += `<@&${reward.id}> - ${percentage}%\n`;
        }
      }

      // Create the main embed
      const mainEmbed = createEmbed(
        "🎰 Bienvenue au Casino !",
        `**Prêt à tenter votre chance ?**\n\n` +
          `Le Casino vous offre une expérience de jeu unique avec des **jeux passionnants**, des **tirages de rôles** et bien plus encore !\n\n` +
          `**JEUX DISPONIBLES**\n\n` +
          `**Blackjack** - Battez le croupier**\n` +
          `**Roulette** - Rouge, Noir ou Vert**\n` +
          `**Coinflip** - Pile ou Face**\n` +
          `**Crash** - Encaissez avant le crash**\n\n` +
          `**ÉCONOMIE**\n\n` +
          `**Gagnez des coins en jouant**\n` +
          `**Offrez des coins à vos amis**\n` +
          `**Volez d'autres joueurs (cooldown 2h)**\n` +
          `**Récompense quotidienne de 200 coins**`,
        COLORS.GOLD,
      );

      const tiragesEmbed = createEmbed(
        "🎫 Système de Tirages",
        `**Obtenez des rôles de couleur exclusifs !**\n\n` +
          `Chaque joueur commence avec **2 tirages gratuits**.\n\n` +
          `**Comment obtenir plus de tirages ?**\n` +
          `**Giveaways et événements**\n` +
          `**Rôle Soutien : +1 tirage/semaine**\n` +
          `**Rôle Booster : +2 tirages/semaine**\n\n` +
          `**Rôles disponibles et leurs probabilités :**\n\n${rolesDisplay}`,
        COLORS.VIOLET,
      );

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("access_casino")
          .setLabel("🎰 Accéder au Casino")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🎲"),
      );

      // Send the embeds to the casino channel
      await casinoChannel.send({
        embeds: [mainEmbed, tiragesEmbed],
        components: [button],
      });

      // Send welcome message to casino-chat only if it was just created
      if (!channelAlreadyExists) {
        const welcomeEmbed = createEmbed(
          "🎰 Bienvenue dans le Casino Chat !",
          `Vous avez maintenant accès au casino !\n\n` +
            `**Commandes principales :**\n` +
            `• \`;help\` - Liste complète des commandes\n` +
            `• \`;profil\` - Voir votre profil\n` +
            `• \`;bal\` - Voir votre solde\n` +
            `• \`;timer\` - Voir vos temps de recharge\n` +
            `• \`;tirage\` - Effectuer un tirage de rôle\n` +
            `• \`;bj [mise]\` - Jouer au Blackjack\n\n` +
            `**Bonne chance ! 🍀**`,
          COLORS.SUCCESS,
        );

        await casinoChatChannel.send({ embeds: [welcomeEmbed] });
      }

      const statusMsg = channelAlreadyExists
        ? `Le casino a été configuré avec succès !\n\n• Salon d'accès : <#${CASINO_CHANNEL_ID}>\n• Salon de jeu : <#${casinoChatChannel.id}> (existant)\n• Rôle : <@&${casinoRoleId}>`
        : `Le casino a été configuré avec succès !\n\n• Salon d'accès : <#${CASINO_CHANNEL_ID}>\n• Salon de jeu : <#${casinoChatChannel.id}> (créé)\n• Rôle : <@&${casinoRoleId}>`;

      message.reply({
        embeds: [createEmbed("✅ Setup terminé !", statusMsg, COLORS.SUCCESS)],
      });
    } catch (error) {
      console.error("Setup error:", error);
      message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            `Une erreur est survenue lors du setup : ${error.message}`,
            COLORS.ERROR,
          ),
        ],
      });
    }
  },
};
