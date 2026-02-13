const { createEmbed, COLORS, formatCoins, sendLog } = require("../utils");
const { drawRole, ROLE_POOL, WINS_CHANNEL_ID } = require("../roleConfig");

module.exports = {
  name: "tirage",
  description: "Effectue un tirage pour obtenir un rôle de couleur ou des coins",
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
    const wonReward = drawRole();
    const probability = (wonReward.probability * 100).toFixed(3);

    // Remove one tirage
    await db.updateTirages(message.author.id, -1);

    // Determine rarity emoji
    let rarityEmoji = "🔸";
    let rarityText = "Commun";
    if (wonReward.probability < 0.01) {
      rarityEmoji = "💎";
      rarityText = "ULTRA RARE";
    } else if (wonReward.probability < 0.05) {
      rarityEmoji = "⭐";
      rarityText = "RARE";
    } else if (wonReward.probability < 0.15) {
      rarityEmoji = "🔹";
      rarityText = "Peu commun";
    }

    // Handle Coins Reward
    if (wonReward.type === 'coins') {
        const amount = BigInt(wonReward.amount);
        await db.updateBalance(message.author.id, amount);

        // Announce in wins channel
        try {
            const winsChannel = await message.client.channels.fetch(WINS_CHANNEL_ID);
            if (winsChannel) {
              const winEmbed = createEmbed(
                `${rarityEmoji} TIRAGE : COINS GAGNÉS !`,
                `**${message.author.username}** a gagné **${formatCoins(amount)}** dans un tirage !\n\n` +
                  `**Rareté:** ${rarityText}\n` +
                  `**Probabilité:** ${probability}%`,
                wonReward.color,
              );
              winEmbed.setThumbnail(
                message.author.displayAvatarURL({ dynamic: true }),
              );
              await winsChannel.send({ embeds: [winEmbed] });
            }
        } catch (e) {
            console.error("Failed to send coin tirage announcement:", e);
        }

        const embed = createEmbed(
            `${rarityEmoji} Tirage réussi !`,
            `Vous avez gagné **${formatCoins(amount)}** !\n\n` +
              `**Rareté:** ${rarityText}\n` +
              `**Probabilité:** ${probability}%\n\n` +
              `Tirages restants: **${user.tirages - 1}** 🎫`,
            wonReward.color,
        );
        return message.reply({ embeds: [embed] });
    }

    // Handle Role Reward
    try {
      const member = await message.guild.members.fetch(message.author.id);
      const role = message.guild.roles.cache.get(wonReward.id);

      if (!role) {
        return message.reply({
          embeds: [
            createEmbed(
              "Erreur",
              `Le rôle **${wonReward.name}** n'existe pas sur ce serveur.`,
              COLORS.ERROR,
            ),
          ],
        });
      }

      // Check if user already has this role
      if (member.roles.cache.has(wonReward.id)) {
        return message.reply({
          embeds: [
            createEmbed(
              "Dommage, déjà possédé ! 🎫",
              `Vous possédez déjà le rôle <@&${wonReward.id}> !\n\nVotre tirage a été consommé mais vous pouvez retenter votre chance.\n\nTirages restants: **${user.tirages - 1}** 🎫`,
              COLORS.ERROR,
            ),
          ],
        });
      }

      // Add the new role
      await member.roles.add(role);

      // Handle role expiration if applicable
      if (wonReward.duration) {
        const expiresAt = Date.now() + wonReward.duration;
        await db.addRoleExpiration(message.author.id, wonReward.id, expiresAt, message.guild.id);
        
        // LOG
        const durationText = (wonReward.duration / (60*60*1000)).toFixed(1) + 'h';
        await sendLog(
            message.guild,
            '🎁 Role Temporaire Gagné (Tirage)',
            `<@${message.author.id}> a gagné le rôle <@&${wonReward.id}> via un tirage.\n\n**Durée :** ${durationText}`,
            COLORS.SUCCESS
        );
      }

      // Announce role win
      try {
        const winsChannel =
          await message.client.channels.fetch(WINS_CHANNEL_ID);
        if (winsChannel) {
          const winEmbed = createEmbed(
            `${rarityEmoji} NOUVEAU RÔLE OBTENU !`,
            `**${message.author.username}** a obtenu le rôle <@&${wonReward.id}> !\n\n` +
              `**Rareté:** ${rarityText}\n` +
              `**Probabilité:** ${probability}%`,
            wonReward.color,
          );
          winEmbed.setThumbnail(
            message.author.displayAvatarURL({ dynamic: true }),
          );
          await winsChannel.send({ embeds: [winEmbed] });
        }
      } catch (e) {
        console.error("Failed to send role tirage announcement:", e);
      }

      const embed = createEmbed(
        `${rarityEmoji} Tirage réussi !`,
        `Vous avez obtenu le rôle <@&${wonReward.id}> !\n\n` +
          `**Rareté:** ${rarityText}\n` +
          `**Probabilité:** ${probability}%\n\n` +
          `Tirages restants: **${user.tirages - 1}** 🎫`,
        wonReward.color,
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
