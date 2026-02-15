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

const GLORY_HOUR_CHANCE_DAILY = 0.3; // 30% chance for a glory hour today
const GLORY_HOUR_DURATION = 30 * 60 * 1000; // 30 minutes
const VOLE_GENIE_CHANCE = 0.03; // 3%
const CASINO_CHANNEL_ID = "1469713523549540536";
const ROLE_ID = "1469713522194780404"; // Casino Role
const EVENT_CONFIG_KEY = "glory_hour_schedule";

let scheduledTimeouts = [];

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
    // Check for active event on startup (recovering currently running event)
    await module.exports.checkActiveEvent(client, db);

    // Schedule daily planner at 9 AM
    cron.schedule(
      "0 9 * * *",
      async () => {
        await module.exports.scheduleDailyGloryHour(db);
        await module.exports.loadAndScheduleEvents(client, db);
      },
      { timezone: "Europe/Paris" }
    );

    // Load schedule (recovering future events)
    await module.exports.loadAndScheduleEvents(client, db);
  },

  scheduleDailyGloryHour: async (db) => {
    const now = new Date();
    const times = [];

    // Decide if we have an event today
    if (Math.random() < GLORY_HOUR_CHANCE_DAILY) {
      const startMin = 10 * 60; // 10:00
      const endMin = 21 * 60;   // 21:00
      const randomMin = Math.floor(Math.random() * (endMin - startMin + 1)) + startMin;
      
      const timestamp = new Date(now);
      timestamp.setHours(0, 0, 0, 0);
      timestamp.setMinutes(randomMin);
      
      if (timestamp > now) {
        times.push(timestamp.getTime());
      }
    }

    await db.setConfig(EVENT_CONFIG_KEY, JSON.stringify(times));
    console.log(`[Events] Glory Hour scheduled: ${times.length > 0 ? new Date(times[0]).toLocaleTimeString() : 'None today'}`);
  },

  loadAndScheduleEvents: async (client, db) => {
    scheduledTimeouts.forEach(t => clearTimeout(t));
    scheduledTimeouts = [];

    const scheduleJson = await db.getConfig(EVENT_CONFIG_KEY);
    if (!scheduleJson) {
      // Past 9am and no schedule? Generate one.
      if (new Date().getHours() >= 9) {
        await module.exports.scheduleDailyGloryHour(db);
        return module.exports.loadAndScheduleEvents(client, db);
      }
      return;
    }

    let times = JSON.parse(scheduleJson);
    const now = Date.now();

    times.forEach(timestamp => {
      if (timestamp > now) {
        const delay = timestamp - now;
        const timeout = setTimeout(() => module.exports.startGloryHour(client, db), delay);
        scheduledTimeouts.push(timeout);
      }
    });
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
