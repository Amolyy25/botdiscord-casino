const cron = require("node-cron");
const { createEmbed, COLORS, formatCoins, sendLog } = require("../utils");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");

let doubleGainActive = false;
let doubleGainEndTime = 0;

const GLORY_HOUR_CHANCE = 0.05; // 5%
const GLORY_HOUR_DURATION = 30 * 60 * 1000; // 30 minutes
const VOLE_GENIE_CHANCE = 0.03; // 3%
const CASINO_CHANNEL_ID = "1469713523549540536";
const ROLE_ID = "1469713522194780404"; // Casino Role

const QUESTIONS = [
  { q: "Combien font 7 x 8 ?", a: ["56"] },
  { q: "Quelle est la capitale de la France ?", a: ["paris"] },
  { q: "Combien de côtés a un triangle ?", a: ["3", "trois"] },
  {
    q: "Quel est l'élément chimique dont le symbole est O ?",
    a: ["oxygène", "oxygene"],
  },
  { q: "Combien font 12 + 15 ?", a: ["27"] },
  {
    q: "Quelle couleur obtient-on en mélangeant rouge et bleu ?",
    a: ["violet"],
  },
  { q: "Combien de jours y a-t-il dans une année bissextile ?", a: ["366"] },
  { q: "Quel est le résultat de 100 / 4 ?", a: ["25"] },
  { q: "Combien font 9 x 9 ?", a: ["81"] },
  { q: "Quelle est la première lettre de l'alphabet ?", a: ["a"] },
];

module.exports = {
  init: async (client, db) => {
    // Check for active event on startup
    await module.exports.checkActiveEvent(client, db);

    // Schedule cron for "L'Heure de Gloire"
    cron.schedule(
      "0 * * * *",
      async () => {
        // Every hour at minute 0
        if (doubleGainActive) return; // Already active

        if (Math.random() < GLORY_HOUR_CHANCE) {
          await module.exports.startGloryHour(client, db);
        }
      },
      {
        timezone: "Europe/Paris",
      },
    );
  },

  checkActiveEvent: async (client, db) => {
    const status = await db.getEventStatus("glory_hour");
    if (status && status.value === "true") {
      const now = Date.now();
      const endTime = parseInt(status.end_time);

      if (now < endTime) {
        doubleGainActive = true;
        doubleGainEndTime = endTime;
        console.log(
          `[Events] L'Heure de Gloire restaurée. Fin dans ${(endTime - now) / 1000}s`,
        );

        // Schedule end
        setTimeout(() => {
          module.exports.endGloryHour(client, db);
        }, endTime - now);
      } else {
        // Expired while offline
        await module.exports.endGloryHour(client, db);
      }
    }
  },

  startGloryHour: async (client, db) => {
    doubleGainActive = true;
    doubleGainEndTime = Date.now() + GLORY_HOUR_DURATION;

    await db.setEventStatus("glory_hour", true, doubleGainEndTime);

    // Announce
    const channel = await client.channels
      .fetch(CASINO_CHANNEL_ID)
      .catch(() => null);
    if (channel) {
      const embed = createEmbed(
        "⚡ L'HEURE DE GLOIRE A SONNÉ !",
        `🎰 **Tous les gains du casino sont DOUBLÉS pendant 30 minutes !** 🎰\n\n` +
          `Profitez-en maintenant ! <@&${ROLE_ID}>\n` +
          `Fin de l'événement : <t:${Math.floor(doubleGainEndTime / 1000)}:R>`,
        COLORS.GOLD,
      );
      embed.setImage(
        "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNzQxdDdzOWNieHhrMGF5NGw3b2QzaHNqd250OTUyNXRubmJmajM2OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Vu5UbNpjpqfMq2UFg0/giphy.gif",
      ); // Generic hype gif or use generate_image if allowed/needed

      await channel.send({ content: `<@&${ROLE_ID}>`, embeds: [embed] });
    }

    setTimeout(() => {
      module.exports.endGloryHour(client, db);
    }, GLORY_HOUR_DURATION);
  },

  endGloryHour: async (client, db) => {
    if (!doubleGainActive) return;

    doubleGainActive = false;
    doubleGainEndTime = 0;
    await db.setEventStatus("glory_hour", false, 0);

    const channel = await client.channels
      .fetch(CASINO_CHANNEL_ID)
      .catch(() => null);
    if (channel) {
      const embed = createEmbed(
        "Fin de l'Heure de Gloire",
        `L'événement est terminé ! Les gains reviennent à la normale.`,
        COLORS.PRIMARY,
      );
      await channel.send({ embeds: [embed] });
    }
  },

  isDoubleGainActive: () => {
    return doubleGainActive;
  },

  getGloryHourMultiplier: () => {
    return doubleGainActive ? 2n : 1n;
  },

  getGloryHourStatus: () => {
    if (doubleGainActive) {
      return {
        text: "🌟 HEURE DE GLOIRE ACTIVE : GAINS DOUBLÉS ! 🌟",
        active: true,
      };
    }
    return { text: "", active: false };
  },

  triggerVolDeGenie: async (message, db, targetUser, force = false) => {
    // 3% chance or forced
    if (!force && Math.random() > 0.03) return { triggered: false };

    const questionObj = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];

    const embed = createEmbed(
      "🕵️ VOL DE GÉNIE - ALERTE SÉCURITÉ !",
      `**Système de sécurité activé !**\n\n` +
        `Pour réussir ce vol, vous devez répondre à la question suivante en moins de **15 secondes** :\n\n` +
        `❓ **${questionObj.q}**`,
      COLORS.VIOLET,
    );

    const replyMsg = await message.reply({ embeds: [embed] });

    try {
      const filter = (m) => m.author.id === message.author.id;
      const collected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 15000,
        errors: ["time"],
      });
      const answer = collected.first().content.toLowerCase();

      if (questionObj.a.includes(answer)) {
        await replyMsg.edit({
          embeds: [
            createEmbed(
              "✅ Accès Autorisé",
              "Sécurité désactivée. Le vol procède avec un bonus !",
              COLORS.SUCCESS,
            ),
          ],
        });
        return { triggered: true, success: true };
      } else {
        await replyMsg.edit({
          embeds: [
            createEmbed(
              "❌ Accès Refusé",
              "Alerte déclenchée ! La police arrive.",
              COLORS.ERROR,
            ),
          ],
        });
        return { triggered: true, success: false };
      }
    } catch (e) {
      await replyMsg.edit({
        embeds: [
          createEmbed(
            "⏰ Temps écoulé",
            "Le système de sécurité vous a bloqué.",
            COLORS.ERROR,
          ),
        ],
      });
      return { triggered: true, success: false };
    }
  },
};
