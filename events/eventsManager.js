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
let endTimeout = null;

// L'Heure de Gloire s'active 1 fois par jour, à une heure aléatoire entre 19h et 23h
const GLORY_HOUR_DURATION = 10 * 60 * 1000; // 10 minutes
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
    // Récupérer un événement en cours (si le bot a redémarré pendant une Heure de Gloire)
    await module.exports.checkActiveEvent(client, db);

    // --- PERSISTANCE INTELLIGENTE ---
    // Au démarrage : vérifier si aujourd'hui a déjà un schedule, sinon en créer un
    await module.exports.ensureTodaySchedule(db);
    await module.exports.loadAndScheduleEvents(client, db);

    // Cron quotidien à 9h → générer le schedule du jour (si pas déjà fait)
    cron.schedule(
      "0 9 * * *",
      async () => {
        await module.exports.scheduleDailyGloryHour(db, true);
        await module.exports.loadAndScheduleEvents(client, db);
      },
      { timezone: "Europe/Paris" }
    );
  },

  // --- PERSISTANCE : vérifie si un schedule existe pour aujourd'hui ---
  // Appelé au démarrage du bot pour ne jamais perdre l'événement du jour
  ensureTodaySchedule: async (db) => {
    const scheduleJson = await db.getConfig(EVENT_CONFIG_KEY);
    if (scheduleJson) {
      const times = JSON.parse(scheduleJson);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Vérifier si un timestamp stocké correspond à aujourd'hui
      const hasTodayEvent = times.some(t => t >= today.getTime() && t < tomorrow.getTime());
      if (hasTodayEvent) {
        console.log(`[Events] Glory Hour schedule for today already exists, skipping generation.`);
        return; // Schedule existe déjà pour aujourd'hui → ne pas écraser
      }
    }

    // Pas de schedule pour aujourd'hui → en créer un
    await module.exports.scheduleDailyGloryHour(db, false);
  },

  // force = true quand appelé par le cron (nouveau jour garanti)
  scheduleDailyGloryHour: async (db, force = false) => {
    // Si pas forcé, vérifier qu'on n'écrase pas un schedule existant
    if (!force) {
      const existing = await db.getConfig(EVENT_CONFIG_KEY);
      if (existing) {
        const times = JSON.parse(existing);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const hasTodayEvent = times.some(t => t >= today.getTime() && t < tomorrow.getTime());
        if (hasTodayEvent) return; // Déjà programmé pour aujourd'hui
      }
    }

    const now = new Date();
    const plannedDate = new Date(now);
    
    // 1 Heure de Gloire par jour, heure aléatoire entre 19h et 23h
    const startMin = 19 * 60; // 19:00
    const endMin = 23 * 60;   // 23:00
    const randomMin = Math.floor(Math.random() * (endMin - startMin)) + startMin;
    
    plannedDate.setHours(0, 0, 0, 0);
    plannedDate.setMinutes(randomMin);
    
    const plannedTimestamp = plannedDate.getTime();
    
    // On récupère les schedules existants pour ne pas écraser ceux des autres jours (si jamais)
    let allTimes = [];
    const existingJson = await db.getConfig(EVENT_CONFIG_KEY);
    if (existingJson) {
        allTimes = JSON.parse(existingJson).filter(t => {
            const d = new Date(t);
            d.setHours(0, 0, 0, 0);
            return d.getTime() !== plannedDate.getTime(); // Garder les autres jours
        });
    }
    
    allTimes.push(plannedTimestamp);
    // Garder seulement les 7 derniers jours pour nettoyer la DB
    allTimes.sort((a,b) => b-a);
    allTimes = allTimes.slice(0, 7);

    await db.setConfig(EVENT_CONFIG_KEY, JSON.stringify(allTimes));
    console.log(`[Events] Glory Hour scheduled for ${plannedDate.toLocaleDateString()} at ${plannedDate.toLocaleTimeString()}`);
  },

  loadAndScheduleEvents: async (client, db) => {
    scheduledTimeouts.forEach(t => clearTimeout(t));
    scheduledTimeouts = [];

    const scheduleJson = await db.getConfig(EVENT_CONFIG_KEY);
    if (!scheduleJson) return;

    let times = JSON.parse(scheduleJson);
    const now = Date.now();

    times.forEach(timestamp => {
      // On ne planifie que si c'est dans le futur
      if (timestamp > now) {
        const delay = timestamp - now;
        const timeout = setTimeout(() => module.exports.startGloryHour(client, db), delay);
        scheduledTimeouts.push(timeout);
        console.log(`[Events] Glory Hour scheduled in ${Math.round(delay/1000/60)} min`);
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
        if (endTimeout) clearTimeout(endTimeout);
        endTimeout = setTimeout(() => {
          module.exports.endGloryHour(client, db);
        }, endTime - now);
      } else {
        // Expired while offline
        await module.exports.endGloryHour(client, db);
      }
    }
  },

  startGloryHour: async (client, db, durationMs = null) => {
    const duration = durationMs || GLORY_HOUR_DURATION;
    doubleGainActive = true;
    doubleGainEndTime = Date.now() + duration;

    await db.setEventStatus("glory_hour", true, doubleGainEndTime);

    // Announce
    const channel = await client.channels
      .fetch(CASINO_CHANNEL_ID)
      .catch(() => null);
    if (channel) {
      const embed = createEmbed(
        "⚡ L'HEURE DE GLOIRE A SONNÉ !",
        `🎰 **Tous les gains du casino sont DOUBLÉS pendant ${Math.round(duration / 60000)} minutes !** 🎰\n\n` +
          `Profitez-en maintenant ! <@&${ROLE_ID}>\n` +
          `Fin de l'événement : <t:${Math.floor(doubleGainEndTime / 1000)}:R>`,
        COLORS.GOLD,
      );
      embed.setImage(
        "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNzQxdDdzOWNieHhrMGF5NGw3b2QzaHNqd250OTUyNXRubmJmajM2OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Vu5UbNpjpqfMq2UFg0/giphy.gif",
      ); // Generic hype gif or use generate_image if allowed/needed

      await channel.send({ content: `<@&${ROLE_ID}>`, embeds: [embed] });
    }

    if (endTimeout) clearTimeout(endTimeout);
    endTimeout = setTimeout(() => {
      module.exports.endGloryHour(client, db);
    }, duration);
  },

  endGloryHour: async (client, db) => {
    if (!doubleGainActive) return;

    doubleGainActive = false;
    doubleGainEndTime = 0;
    if (endTimeout) clearTimeout(endTimeout);
    endTimeout = null;
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
