const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { createEmbed, COLORS, formatCoins } = require("../utils");
const shopData = require("../shop.json");

function getItemLabel(itemId) {
  const item = shopData.items.find((i) => i.id === itemId);
  return item ? `${item.emoji} ${item.label}` : itemId;
}

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

module.exports = {
  name: "shophis",
  description: "Affiche l'historique d'achats boutique d'un utilisateur (Admin)",
  async execute(message, args, db) {
    // Vérification admin
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({
        embeds: [
          createEmbed("Erreur", "Permission insuffisante.", COLORS.ERROR),
        ],
      });
    }

    // Récupérer l'utilisateur cible
    let targetUser = message.mentions.users.first();
    let targetId = args[0] ? args[0].replace(/[<@!>]/g, "") : null;

    if (!targetId) {
      return message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            "Vous devez mentionner un utilisateur ou fournir un ID.\nUsage : `;shophis @user` ou `;shophis 123456789`",
            COLORS.ERROR,
          ),
        ],
      });
    }

    // Essayer de récupérer l'utilisateur Discord
    if (!targetUser && targetId) {
      try {
        targetUser = await message.client.users.fetch(targetId);
      } catch (e) {
        // L'utilisateur n'existe pas ou a quitté
      }
    }

    const displayName = targetUser
      ? `**${targetUser.username}**`
      : `\`${targetId}\``;

    try {
      // Récupérer les stats globales
      const stats = await db.getShopPurchaseCount(targetId);

      // Récupérer les 20 derniers achats
      const purchases = await db.getShopPurchases(targetId, 20);

      if (purchases.length === 0) {
        return message.reply({
          embeds: [
            createEmbed(
              `🛒 Historique de ${displayName}`,
              "Aucun achat enregistré pour cet utilisateur.",
              COLORS.PRIMARY,
            ),
          ],
        });
      }

      // Construire la liste des achats
      let purchaseList = "";
      for (const purchase of purchases) {
        const itemLabel = getItemLabel(purchase.item_id);
        const date = formatDate(purchase.purchased_at);
        const targetStr = purchase.target_id
          ? ` → <@${purchase.target_id}>`
          : "";

        purchaseList +=
          `**${date}** — ${itemLabel}\n` +
          `┗ ${formatCoins(purchase.price)}${targetStr}\n\n`;
      }

      // Construire l'embed
      const embed = new EmbedBuilder()
        .setTitle(`🛒 Historique d'achats de ${targetUser ? targetUser.username : targetId}`)
        .setDescription(
          `**📊 Statistiques globales**\n` +
            `• Achats totaux : **${stats.count}**\n` +
            `• Total dépensé : ${formatCoins(stats.totalSpent)}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `**📜 Derniers achats** *(max 20)*\n\n` +
            purchaseList,
        )
        .setColor(COLORS.GOLD)
        .setTimestamp();

      if (targetUser && targetUser.displayAvatarURL) {
        embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));
      }

      embed.setFooter({
        text: `ID: ${targetId}`,
      });

      message.reply({ embeds: [embed] });
    } catch (error) {
      console.error("Erreur shophis:", error);
      message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            `Une erreur est survenue : ${error.message}`,
            COLORS.ERROR,
          ),
        ],
      });
    }
  },
};
