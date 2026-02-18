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
        `**Le Casino vous offre une expérience de jeu unique !**\n\n` +
          `**COMMENT JOUER ?**\n` +
          `Utilisez les boutons ci-dessous pour obtenir l'accès ou consulter les récompenses des tirages. Une fois l'accès obtenu, vous pourrez jouer dans le salon <#${casinoChatChannel.id}>.\n\n` +
          `**JEUX DISPONIBLES**\n\n` +
          `• **Blackjack** : Battez le croupier pour doubler votre mise.\n` +
          `• **Roulette** : Pariez sur une couleur ou un numéro.\n` +
          `• **Coinflip** : Pile ou Face, 50% de chance de gagner.\n` +
          `• **Crash** : Encaissez avant que le multiplicateur ne s'arrête.\n` +
          `• **MINES** : Une grille, des diamands et des mines\n` +
          `• **TOWER** : Trouvez la bonne porte parmi les trois\n` +
          `** TIRAGES DE RÔLES**\n` +
          `Tentez de gagner des rôles de couleur exclusifs, des coins ou des tirages bonus ! Cliquez sur le bouton **TIRAGES** pour voir la liste complète des lots.\n\n` +
          `**ÉCONOMIE**\n` +
          `• Gagnez des coins en jouant aux jeux.\n` +
          `• Utilisez \`;daily\` chaque jour pour **500 coins**.\n` +
          `• Utilisez \`;collect\` chaque 30M pour **150 coins**.\n` +
          `• Utilisez \`;profil\` pour voir votre solde et vos tirages.`,
        COLORS.GOLD,
      );

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("access_casino")
          .setLabel("🎰 Accéder au Casino")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("show_rewards")
          .setLabel("🎫 TIRAGES")
          .setStyle(ButtonStyle.Primary)
      );

      // Send the embeds to the casino channel
      await casinoChannel.send({
        embeds: [mainEmbed],
        components: [buttons],
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
