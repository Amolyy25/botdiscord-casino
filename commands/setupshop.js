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
      // Construire la description des catégories
      let categoriesDescription = "";
      for (const cat of shopData.categories) {
        const itemCount = shopData.items.filter(
          (i) => i.category === cat.id,
        ).length;
        categoriesDescription +=
          `**${cat.label}** ・ ${itemCount} articles\n` +
          `${cat.description}\n\n`;
      }

      // Embed principal sobre
      const shopEmbed = new EmbedBuilder()
        .setTitle("BOUTIQUE")
        .setDescription(
          `Bienvenue dans la boutique du casino.\n` +
            `Depensez vos coins pour obtenir des pouvoirs, boosts et objets exclusifs.\n\n` +
            categoriesDescription +
            `Selectionnez une categorie ci-dessous.`,
        )
        .setColor(COLORS.PRIMARY)
        .setFooter({
          text: "Les achats sont definitifs ・ Verifiez votre solde avec ;bal",
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
          .setPlaceholder("Choisir une categorie...")
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
            "Boutique installee",
            `L'embed de la boutique a ete envoye dans ce salon.\n\n` +
              `**${shopData.categories.length}** categories ・ **${shopData.items.length}** articles disponibles`,
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
