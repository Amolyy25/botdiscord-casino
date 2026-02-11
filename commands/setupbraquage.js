const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { createEmbed, COLORS, formatCoins } = require("../utils");
const cron = require("node-cron");

// IDs de configuration
const ANNONCE_CHANNEL_ID = "1471224764973449328";
const REPONSE_CHANNEL_ID = "1471225050417070190";
const ROLE_BRAQUAGE_ID = "1470554786502803638";
const ROLE_CASINO_ID = "1469713522194780404";
const BRAQUAGE_REWARD = 700;

// Horaires
const HEURE_OUVERTURE = 20; // 20h30
const MINUTE_OUVERTURE = 30;
const HEURE_FERMETURE = 23; // 23h59
const MINUTE_FERMETURE = 59;

/**
 * Lance le scénario du braquage : envoie l'énigme, déverrouille le salon, et lance le collecteur.
 */
async function lancerBraquage({
  annonceChannel,
  reponseChannel,
  guild,
  code,
  embedDescription,
  db,
}) {
  // Créer l'embed d'annonce avec l'énigme
  const annonceEmbed = new EmbedBuilder()
    .setTitle("🔫 BRAQUAGE EN COURS !")
    .setDescription(embedDescription)
    .setColor("#FF0000")
    .setThumbnail(
      "https://www.shutterstock.com/image-vector/robbery-thief-character-cartoon-masked-600nw-2677964105.jpg",
    )
    .addFields(
      {
        name: "💰 Récompense",
        value: formatCoins(BRAQUAGE_REWARD),
        inline: true,
      },
      { name: "🎭 Rôle", value: `<@&${ROLE_BRAQUAGE_ID}>`, inline: true },
      {
        name: "📍 Salon de réponse",
        value: `<#${REPONSE_CHANNEL_ID}>`,
        inline: false,
      },
      { name: "⏰ Fermeture", value: "Aujourd'hui à **23h59**", inline: false },
    )
    .setFooter({
      text: "Trouvez le code à 4 chiffres pour braquer le coffre !",
    })
    .setTimestamp();

  // Envoyer l'énigme dans le salon d'annonce
  await annonceChannel.send({ embeds: [annonceEmbed] });

  // Déverrouiller le salon réponse
  await reponseChannel.permissionOverwrites.edit(guild.id, {
    SendMessages: null, // Reset to default (inherit)
  });

  await reponseChannel.send({
    embeds: [
      createEmbed(
        "🔓 LE COFFRE EST ACCESSIBLE !",
        "**Tapez le code maintenant !**\nLe premier à trouver le bon code remportera le braquage !\n\n⏰ Vous avez jusqu'à **23h59** pour trouver le code !",
        COLORS.SUCCESS,
      ),
    ],
  });

  // Lancer le collecteur de messages AVANT le cron pour éviter une référence undefined
  // Timeout de sécurité : 4h max (20h30→00h30 couvre largement la fenêtre 20h30→23h59)
  const filter = (msg) => !msg.author.bot;
  const collector = reponseChannel.createMessageCollector({ filter, time: 4 * 60 * 60 * 1000 });

  // Programmer la fermeture automatique à 23h59
  const closeCron = cron.schedule(
    "59 23 * * *",
    async () => {
      try {
        // Verrouiller le salon
        await reponseChannel.permissionOverwrites.edit(guild.id, {
          SendMessages: false,
        });

        await reponseChannel.send({
          embeds: [
            createEmbed(
              "🔒 Temps écoulé !",
              "Le coffre s'est refermé... Personne n'a trouvé le code cette fois !\nÀ la prochaine !",
              COLORS.ERROR,
            ),
          ],
        });

        // Arrêter le collecteur
        collector.stop("timeout");
      } catch (err) {
        console.error("Erreur lors de la fermeture auto du braquage :", err);
      } finally {
        // Toujours arrêter le cron, même en cas d'erreur, pour éviter qu'il se redéclenche le lendemain
        closeCron.stop();
      }
    },
    {
      timezone: "Europe/Paris",
    },
  );

  collector.on("collect", async (msg) => {
    // Vérifier si le message contient le bon code
    if (msg.content.trim() === code) {
      // Arrêter le collecteur immédiatement
      collector.stop("winner_found");
      // Arrêter le cron de fermeture auto
      closeCron.stop();

      const winnerId = msg.author.id;

      try {
        // 1. Ajouter les coins au gagnant (créer l'utilisateur si nécessaire)
        await db.updateBalance(winnerId, BRAQUAGE_REWARD);

        // 2. Récupérer le membre
        const member = await guild.members.fetch(winnerId).catch(() => null);

        if (member) {
          // 3. Attribuer le rôle Casino si pas déjà présent
          if (!member.roles.cache.has(ROLE_CASINO_ID)) {
            await member.roles.add(ROLE_CASINO_ID).catch(() => {});
          }

          // 4. Attribuer le rôle Braquage
          await member.roles.add(ROLE_BRAQUAGE_ID).catch(() => {});
        }

        // 5. Enregistrer l'expiration du rôle (7 jours)
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
        await db.addBraquageWinner(
          winnerId,
          code,
          BRAQUAGE_REWARD,
          ROLE_BRAQUAGE_ID,
          expiresAt,
        );
        await db.addRoleExpiration(winnerId, ROLE_BRAQUAGE_ID, expiresAt);

        // 6. Verrouiller le salon de réponse
        await reponseChannel.permissionOverwrites.edit(guild.id, {
          SendMessages: false,
        });

        // 7. Annoncer le gagnant dans le salon réponse
        const winEmbed = new EmbedBuilder()
          .setTitle("🎉 BRAQUAGE RÉUSSI !")
          .setDescription(
            `<@${winnerId}> a trouvé le code et s'empare du coffre !\n\n` +
              `💰 **Gain :** ${formatCoins(BRAQUAGE_REWARD)}\n` +
              `🎭 **Rôle :** <@&${ROLE_BRAQUAGE_ID}> (7 jours)\n\n` +
              `🔒 Le coffre est désormais verrouillé. À la prochaine !`,
          )
          .setColor("#43b581")
          .setThumbnail(msg.author.displayAvatarURL({ dynamic: true }))
          .setTimestamp();

        await reponseChannel.send({ embeds: [winEmbed] });

        // 8. Annoncer aussi dans le salon d'annonce
        const annonceWinEmbed = new EmbedBuilder()
          .setTitle("🏆 BRAQUAGE TERMINÉ !")
          .setDescription(
            `Le coffre a été braqué par <@${winnerId}> !\n\n` +
              `💰 **Gain :** ${formatCoins(BRAQUAGE_REWARD)}\n` +
              `🎭 **Rôle obtenu :** <@&${ROLE_BRAQUAGE_ID}>`,
          )
          .setColor("#f1c40f")
          .setTimestamp();

        await annonceChannel.send({ embeds: [annonceWinEmbed] });
      } catch (err) {
        console.error(
          "Erreur lors du traitement du gagnant du braquage :",
          err,
        );
        await reponseChannel.send({
          embeds: [
            createEmbed(
              "Erreur",
              "Une erreur est survenue lors de l'attribution des récompenses.",
              COLORS.ERROR,
            ),
          ],
        });
      }
    }
  });

  return collector;
}

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
      // On utilise Intl.DateTimeFormat pour extraire heure/minute en timezone Europe/Paris
      // sans repasser par new Date() qui réinterprèterait dans le timezone du serveur
      const parisFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Paris",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      });
      const parisParts = parisFormatter.formatToParts(new Date());
      const hourPart = parisParts.find((p) => p.type === "hour");
      const minutePart = parisParts.find((p) => p.type === "minute");

      if (!hourPart || !minutePart) {
        console.error(
          "[Braquage] Impossible de déterminer l'heure de Paris. Parts:",
          parisParts,
        );
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

      const currentHour = parseInt(hourPart.value, 10);
      const currentMinute = parseInt(minutePart.value, 10);
      const currentTimeInMinutes = currentHour * 60 + currentMinute;
      const ouvertureInMinutes = HEURE_OUVERTURE * 60 + MINUTE_OUVERTURE; // 20h30 = 1230 min
      const fermetureInMinutes = HEURE_FERMETURE * 60 + MINUTE_FERMETURE; // 23h59 = 1439 min

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
        // ── AVANT 20H30 : Teaser + verrouillage + cron pour lancer à 20h30 ──

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
              });
            } catch (err) {
              console.error("Erreur lors du lancement cron du braquage :", err);
            } finally {
              // Toujours arrêter le cron, même en cas d'erreur, pour éviter qu'il se redéclenche le lendemain
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
        // ── APRÈS 20H30 (et avant 23h59) : lancer immédiatement ──

        await lancerBraquage({
          annonceChannel,
          reponseChannel,
          guild: message.guild,
          code,
          embedDescription,
          db,
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
