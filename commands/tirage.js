const { createEmbed, COLORS } = require("../utils");
const { drawRole, ROLE_POOL, WINS_CHANNEL_ID } = require("../roleConfig");

module.exports = {
  name: "tirage",
  description: "Effectue un tirage pour obtenir un rôle de couleur",
  async execute(message, args, db) {
    const user = await db.getUser(message.author.id);

    if (user.tirages <= 0) {
      return message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            `Vous n'avez plus de tirages disponibles ! 🎫\n\nUtilisez \`;profil\` pour voir vos tirages restants.`,
            COLORS.ERROR,
          ),
        ],
      });
    }

    // Perform the draw
    const wonRole = drawRole();
    const probability = (wonRole.probability * 100).toFixed(3);

    // Remove one tirage
    await db.updateTirages(message.author.id, -1);

    // Try to assign the role
    try {
      const member = await message.guild.members.fetch(message.author.id);
      const role = message.guild.roles.cache.get(wonRole.id);

      if (!role) {
        return message.reply({
          embeds: [
            createEmbed(
              "Erreur",
              `Le rôle **${wonRole.name}** n'existe pas sur ce serveur.`,
              COLORS.ERROR,
            ),
          ],
        });
      }

      // Check if user already has this role
      if (member.roles.cache.has(wonRole.id)) {
        return message.reply({
          embeds: [
            createEmbed(
              "Dommage, déjà possédé ! 🎫",
              `Vous possédez déjà le rôle <@&${wonRole.id}> !\n\nVotre tirage a été consommé mais vous pouvez retenter votre chance.\n\nTirages restants: **${user.tirages - 1}** 🎫`,
              COLORS.ERROR,
            ),
          ],
        });
      }

      // Add the new role (without removing others)
      await member.roles.add(role);

      // Determine rarity emoji
      let rarityEmoji = "🔸";
      let rarityText = "Commun";
      if (wonRole.probability < 0.01) {
        rarityEmoji = "💎";
        rarityText = "ULTRA RARE";
      } else if (wonRole.probability < 0.05) {
        rarityEmoji = "⭐";
        rarityText = "RARE";
      } else if (wonRole.probability < 0.15) {
        rarityEmoji = "🔹";
        rarityText = "Peu commun";
      }

      // Announce ALL tirages in wins channel
      try {
        const winsChannel =
          await message.client.channels.fetch(WINS_CHANNEL_ID);
        if (winsChannel) {
          const winEmbed = createEmbed(
            `${rarityEmoji} NOUVEAU RÔLE OBTENU !`,
            `**${message.author.username}** a obtenu le rôle <@&${wonRole.id}> !\n\n` +
              `**Rareté:** ${rarityText}\n` +
              `**Probabilité:** ${probability}%`,
            wonRole.color,
          );
          winEmbed.setThumbnail(
            message.author.displayAvatarURL({ dynamic: true }),
          );
          await winsChannel.send({ embeds: [winEmbed] });
        }
      } catch (e) {
        console.error("Failed to send tirage announcement:", e);
      }

      const embed = createEmbed(
        `${rarityEmoji} Tirage réussi !`,
        `Vous avez obtenu le rôle <@&${wonRole.id}> !\n\n` +
          `**Rareté:** ${rarityText}\n` +
          `**Probabilité:** ${probability}%\n\n` +
          `Tirages restants: **${user.tirages - 1}** 🎫`,
        wonRole.color,
      );

      message.reply({ embeds: [embed] });
    } catch (error) {
      console.error("Error assigning role:", error);
      return message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            `Impossible d'attribuer le rôle. Vérifiez les permissions du bot.`,
            COLORS.ERROR,
          ),
        ],
      });
    }
  },
};
