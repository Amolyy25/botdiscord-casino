const {
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
const { createEmbed, COLORS, formatCoins } = require("../utils");
const shopData = require("../shop.json");

module.exports = {
  name: "setupshop",
  description: "Configure la boutique du casino (Admin)",
  async execute(message, args, db) {
    // Vérification admin
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({
        embeds: [
          createEmbed("Erreur", "Permission insuffisante.", COLORS.ERROR),
        ],
      });
    }

    try {
      // Construire la description des catégories depuis le JSON
      let categoriesDescription = "";
      for (const cat of shopData.categories) {
        const itemCount = shopData.items.filter(
          (i) => i.category === cat.id,
        ).length;
        categoriesDescription +=
          `${cat.emoji} **${cat.label}**\n` +
          `┗ ${cat.description} *(${itemCount} articles)*\n\n`;
      }

      // Embed principal de la boutique
      const shopEmbed = new EmbedBuilder()
        .setTitle("🛒 BOUTIQUE DU CASINO")
        .setDescription(
          `**Bienvenue dans la boutique !**\n` +
            `Dépensez vos coins durement gagnés pour obtenir des pouvoirs, des boosts et des objets exclusifs.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            categoriesDescription +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `💡 *Sélectionnez une catégorie ci-dessous pour parcourir les articles.*`,
        )
        .setColor(COLORS.GOLD)
        .setFooter({
          text: "Les achats sont définitifs • Vérifiez votre solde avec ;bal",
        })
        .setTimestamp();

      // StringSelectMenu des catégories
      const categoryOptions = shopData.categories.map((cat) => ({
        label: cat.label,
        value: cat.id,
        description: cat.description,
        emoji: cat.emoji,
      }));

      const categorySelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("shop_category")
          .setPlaceholder("🛒 Choisir une catégorie...")
          .addOptions(categoryOptions),
      );

      // Envoyer l'embed dans le salon actuel
      await message.channel.send({
        embeds: [shopEmbed],
        components: [categorySelect],
      });

      // Confirmer au admin
      await message.reply({
        embeds: [
          createEmbed(
            "✅ Boutique installée !",
            `L'embed de la boutique a été envoyé dans ce salon.\n\n` +
              `**${shopData.categories.length}** catégories • **${shopData.items.length}** articles disponibles\n\n` +
              `⚠️ **N'oubliez pas** de remplacer les IDs de rôles placeholders dans \`shop.json\` par les vrais IDs Discord.`,
            COLORS.SUCCESS,
          ),
        ],
      });
    } catch (error) {
      console.error("Erreur setupshop :", error);
      message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            `Une erreur est survenue lors du setup de la boutique : ${error.message}`,
            COLORS.ERROR,
          ),
        ],
      });
    }
  },
};
