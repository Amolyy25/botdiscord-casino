const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { createEmbed, COLORS, formatCoins } = require("../utils");
const cron = require("node-cron");
const {
  lancerBraquage,
  startBraquageCollector,
  getParisTime,
  ANNONCE_CHANNEL_ID,
  REPONSE_CHANNEL_ID,
  ROLE_BRAQUAGE_ID,
  BRAQUAGE_REWARD,
  HEURE_OUVERTURE,
  MINUTE_OUVERTURE,
  HEURE_FERMETURE,
  MINUTE_FERMETURE,
} = require("../braquageUtils");

module.exports = {
  name: "setupbraquage",
  description: "Lance un braquage avec un code secret (Admin)",
  async execute(message, args, db) {
    // Vérification admin
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({
        embeds: [
          createEmbed("Erreur", "Permission insuffisante.", COLORS.ERROR),
        ],
      });
    }

    // Vérification du code à 4 chiffres
    const code = args[0];
    if (!code || !/^\d{4}$/.test(code)) {
      return message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            "Vous devez fournir un code à **4 chiffres**.\nUsage : `;setupbraquage 1234`",
            COLORS.ERROR,
          ),
        ],
      });
    }

    // Vérification que la commande est une réponse à un message
    if (!message.reference || !message.reference.messageId) {
      return message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            "Vous devez **répondre à un message** pour lancer le braquage.\nLe contenu de ce message sera affiché dans l'annonce.",
            COLORS.ERROR,
          ),
        ],
      });
    }

    // Vérifier qu'il n'y a pas déjà un braquage actif
    const existing = await db.getActiveBraquage();
    if (existing) {
      return message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            "Un braquage est déjà en cours ou programmé ! Attendez qu'il se termine.",
            COLORS.ERROR,
          ),
        ],
      });
    }

    try {
      // Récupérer le message auquel l'utilisateur a répondu
      const repliedMessage = await message.channel.messages.fetch(
        message.reference.messageId,
      );
      const embedDescription = repliedMessage.content || "*Aucun contenu*";

      // Récupérer les salons
      const annonceChannel = await message.guild.channels
        .fetch(ANNONCE_CHANNEL_ID)
        .catch(() => null);
      const reponseChannel = await message.guild.channels
        .fetch(REPONSE_CHANNEL_ID)
        .catch(() => null);

      if (!annonceChannel) {
        return message.reply({
          embeds: [
            createEmbed(
              "Erreur",
              `Le salon d'annonce (ID: ${ANNONCE_CHANNEL_ID}) est introuvable.`,
              COLORS.ERROR,
            ),
          ],
        });
      }

      if (!reponseChannel) {
        return message.reply({
          embeds: [
            createEmbed(
              "Erreur",
              `Le salon de réponse (ID: ${REPONSE_CHANNEL_ID}) est introuvable.`,
              COLORS.ERROR,
            ),
          ],
        });
      }

      // Vérifier l'heure actuelle (Europe/Paris)
      const { currentHour, currentMinute } = getParisTime();

      if (currentHour === null || currentMinute === null) {
        return message.reply({
          embeds: [
            createEmbed(
              "Erreur",
              "Impossible de déterminer l'heure actuelle. Contactez un administrateur.",
              COLORS.ERROR,
            ),
          ],
        });
      }

      const currentTimeInMinutes = currentHour * 60 + currentMinute;
      const ouvertureInMinutes = HEURE_OUVERTURE * 60 + MINUTE_OUVERTURE;
      const fermetureInMinutes = HEURE_FERMETURE * 60 + MINUTE_FERMETURE;

      const isBefore2030 = currentTimeInMinutes < ouvertureInMinutes;
      const isAfter2359 = currentTimeInMinutes >= fermetureInMinutes;

      if (isAfter2359) {
        return message.reply({
          embeds: [
            createEmbed(
              "Erreur",
              "Il est trop tard pour lancer un braquage aujourd'hui ! (après 23h59)\nRevenez demain.",
              COLORS.ERROR,
            ),
          ],
        });
      }

      if (isBefore2030) {
        // ── AVANT 20H30 : Teaser + verrouillage + persister en DB + cron pour lancer à 20h30 ──

        // Persister en DB avec statut "pending"
        const braquageRow = await db.createActiveBraquage(
          message.guild.id,
          code,
          embedDescription,
          "pending",
        );

        // Verrouiller le salon réponse
        await reponseChannel.permissionOverwrites.edit(message.guild.id, {
          SendMessages: false,
        });

        // Envoyer le teaser dans le salon d'annonce
        const teaserEmbed = new EmbedBuilder()
          .setTitle("🔫 ALERTE BRAQUAGE")
          .setDescription(
            "⚠️ **Attention, un braquage est en train de s'organiser... <@&1469071689756442798>**\n\n" +
              "Soyez attentif, à **20h30**, c'est à vous de jouer !\n\n" +
              `**Récompense :** ${formatCoins(BRAQUAGE_REWARD)}\n` +
              `**Rôle :** <@&${ROLE_BRAQUAGE_ID}> (7 jours)\n` +
              `**Salon :** <#${REPONSE_CHANNEL_ID}>`,
          )
          .setColor("#FFA500")
          .setFooter({ text: "Rendez-vous à 20h30 !" })
          .setTimestamp();

        await annonceChannel.send({ embeds: [teaserEmbed] });

        await reponseChannel.send({
          embeds: [
            createEmbed(
              "🔒 Coffre verrouillé",
              "Le coffre est verrouillé pour le moment...\nIl s'ouvrira automatiquement à **20h30** pile !",
              COLORS.ERROR,
            ),
          ],
        });

        // Programmer le lancement du braquage à 20h30
        const openCron = cron.schedule(
          "30 20 * * *",
          async () => {
            try {
              await lancerBraquage({
                annonceChannel,
                reponseChannel,
                guild: message.guild,
                code,
                embedDescription,
                db,
                braquageId: braquageRow.id,
              });
            } catch (err) {
              console.error("Erreur lors du lancement cron du braquage :", err);
            } finally {
              openCron.stop();
            }
          },
          {
            timezone: "Europe/Paris",
          },
        );

        await message.reply({
          embeds: [
            createEmbed(
              "✅ Braquage programmé !",
              `**Code secret :** \`${code}\`\n\n` +
                `📢 Teaser envoyé dans <#${ANNONCE_CHANNEL_ID}>\n` +
                `🔒 Salon <#${REPONSE_CHANNEL_ID}> verrouillé jusqu'à **20h30**\n` +
                `⏰ Ouverture automatique à **20h30** — Fermeture à **23h59**\n` +
                `💰 Récompense : ${formatCoins(BRAQUAGE_REWARD)}\n` +
                `🎭 Rôle : <@&${ROLE_BRAQUAGE_ID}> (7 jours)`,
              COLORS.SUCCESS,
            ),
          ],
        });
      } else {
        // ── APRÈS 20H30 (et avant 23h59) : persister en DB + lancer immédiatement ──

        const braquageRow = await db.createActiveBraquage(
          message.guild.id,
          code,
          embedDescription,
          "active",
        );

        await lancerBraquage({
          annonceChannel,
          reponseChannel,
          guild: message.guild,
          code,
          embedDescription,
          db,
          braquageId: braquageRow.id,
        });

        await message.reply({
          embeds: [
            createEmbed(
              "✅ Braquage lancé !",
              `**Code secret :** \`${code}\`\n\n` +
                `📢 Énigme envoyée dans <#${ANNONCE_CHANNEL_ID}>\n` +
                `🔓 Salon <#${REPONSE_CHANNEL_ID}> ouvert immédiatement\n` +
                `⏰ Fermeture automatique à **23h59**\n` +
                `💰 Récompense : ${formatCoins(BRAQUAGE_REWARD)}\n` +
                `🎭 Rôle : <@&${ROLE_BRAQUAGE_ID}> (7 jours)`,
              COLORS.SUCCESS,
            ),
          ],
        });
      }
    } catch (error) {
      console.error("Erreur setupbraquage :", error);
      message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            `Une erreur est survenue lors du setup du braquage : ${error.message}`,
            COLORS.ERROR,
          ),
        ],
      });
    }
  },
};
