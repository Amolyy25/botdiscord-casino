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
const GLORY_HOUR_DURATION = 15 * 60 * 1000; // 15 minutes
const VOLE_GENIE_CHANCE = 0.03; // 3%
const CASINO_CHANNEL_ID = "1469713523549540536";
const ROLE_ID = "1469713522194780404"; // Casino Role
const EVENT_CONFIG_KEY = "glory_hour_schedule";
let scheduledTimeouts = [];

let blackoutActive = false;
let blackoutEndTime = 0;
let blackoutTimeout = null;
let blackoutInterval = null;

let cohesionActive = false;
let cohesionMultiplier = 2.0;
let cohesionMsg = null;
let uniqueParticipants = new Set();
let lastParticipant = null;
let consecutiveCommandsCount = 0;

let authTimeout = null;
let authCode = null;
let authMsg = null;
let authActive = false;

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

    blackoutActive = false;
    cohesionActive = false;
    authActive = false;
    uniqueParticipants.clear();
    lastParticipant = null;
    consecutiveCommandsCount = 0;
    cohesionMultiplier = 2.0;
    if (blackoutTimeout) clearTimeout(blackoutTimeout);
    if (blackoutInterval) clearInterval(blackoutInterval);
    if (authTimeout) clearTimeout(authTimeout);

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

    // 1. Événement Obligatoire : "Contrôle d'Authentification" (100% chance)
    const authDelay = 60000 + Math.random() * (duration - 120000);
    authTimeout = setTimeout(() => {
      module.exports.triggerAuthControl(client, db);
    }, authDelay);

    // 2. Événement Aléatoire : "Silence est d'Or / Blackout" (30% chance)
    if (Math.random() <= 0.3) {
      const blackoutDelay = 60000 + Math.random() * (duration - 120000);
      blackoutTimeout = setTimeout(() => {
        module.exports.triggerBlackout(client, db);
      }, blackoutDelay);
    }

    // 3. Événement Aléatoire : "Élan Collaboratif" (40% chance)
    if (Math.random() <= 0.4) {
      cohesionActive = true;
      cohesionMultiplier = 2.0;
      module.exports.initCohesionEmbed(client);
    }
  },

  endGloryHour: async (client, db) => {
    if (!doubleGainActive) return;

    doubleGainActive = false;
    doubleGainEndTime = 0;
    if (endTimeout) clearTimeout(endTimeout);
    endTimeout = null;

    if (blackoutTimeout) clearTimeout(blackoutTimeout);
    if (blackoutInterval) clearInterval(blackoutInterval);
    if (authTimeout) clearTimeout(authTimeout);
    blackoutActive = false;
    cohesionActive = false;
    authActive = false;
    
    if (cohesionMsg) {
      cohesionMsg.edit({ content: "**[SYSTEM]** Élan Collaboratif terminé." }).catch(()=>null);
      cohesionMsg = null;
    }

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

  isBlackoutActive: () => {
    return blackoutActive;
  },

  getGloryHourMultiplier: () => {
    return doubleGainActive ? 2n : 1n;
  },

  applyGloryHourMultiplier: (amount) => {
    if (!doubleGainActive) return amount;
    return BigInt(Math.floor(Number(amount) * cohesionMultiplier));
  },

  getGloryHourStatus: () => {
    if (doubleGainActive) {
      let extra = "";
      if (cohesionActive && cohesionMultiplier !== 2.0) {
        extra = ` (x${cohesionMultiplier.toFixed(1)})`;
      }
      return {
        text: `🌟 HEURE DE GLOIRE ACTIVE : GAINS MULTIPLIÉS${extra} ! 🌟`,
        active: true,
      };
    }
    return { text: "", active: false };
  },

  recordCommandActivity: (userId) => {
    if (!cohesionActive) return;
    
    if (lastParticipant === userId) {
      consecutiveCommandsCount++;
      if (consecutiveCommandsCount > 3) {
        cohesionMultiplier -= 0.2;
        if (cohesionMultiplier < 1.0) cohesionMultiplier = 1.0;
        module.exports.updateCohesionEmbed();
        consecutiveCommandsCount = 1; // Reset to avoid spamming the -0.2
      }
    } else {
      lastParticipant = userId;
      consecutiveCommandsCount = 1;
    }

    if (!uniqueParticipants.has(userId)) {
      uniqueParticipants.add(userId);
      cohesionMultiplier += 0.1;
      module.exports.updateCohesionEmbed();
    }
  },

  initCohesionEmbed: async (client) => {
    const channel = await client.channels.fetch(CASINO_CHANNEL_ID).catch(()=>null);
    if (!channel) return;

    const embed = createEmbed(
      "ÉLAN COLLABORATIF",
      `\`\`\`\n[SYSTEM] Analyse de la cohésion en cours...\nMultiplicateur de Cohésion : x${cohesionMultiplier.toFixed(1)}\nParticipants uniques : ${uniqueParticipants.size}\n\`\`\``,
      "#FFFFFF"
    );
    cohesionMsg = await channel.send({ embeds: [embed] }).catch(()=>null);
  },

  updateCohesionEmbed: async () => {
    if (!cohesionActive || !cohesionMsg) return;
    const embed = createEmbed(
      "ÉLAN COLLABORATIF",
      `\`\`\`\n[SYSTEM] Analyse de la cohésion en cours...\nMultiplicateur de Cohésion : x${cohesionMultiplier.toFixed(1)}\nParticipants uniques : ${uniqueParticipants.size}\n\`\`\``,
      "#FFFFFF"
    );
    await cohesionMsg.edit({ embeds: [embed] }).catch(()=>null);
  },

  triggerBlackout: async (client, db) => {
    blackoutActive = true;
    blackoutEndTime = Date.now() + 60000;

    const channel = await client.channels.fetch(CASINO_CHANNEL_ID).catch(()=>null);
    let blackoutMsg = null;
    if (channel) {
      const embed = createEmbed(
        "BLACKOUT",
        `\`\`\`\n[SYSTEM ALERTE]\nSurchauffe des terminaux textuels.\nLe Secteur bascule en mode Vocal uniquement.\nAnalyse réseau vocal : mise de base à 100 coins/sec.\nMultiplicateur évolutif = nombre de membres en vocal !\n\`\`\``,
        "#000000"
      );
      blackoutMsg = await channel.send({ embeds: [embed] }).catch(()=>null);
    }

    let ticks = 0;
    let rewards = new Map();
    let maxMultiplier = 1;

    blackoutInterval = setInterval(() => {
      let currentVoiceUsers = [];
      for (const guild of client.guilds.cache.values()) {
        for (const vChannel of guild.channels.cache.values()) {
          if (vChannel.isVoiceBased()) {
            for (const member of vChannel.members.values()) {
              if (!member.user.bot) {
                currentVoiceUsers.push(member.id);
              }
            }
          }
        }
      }

      let multiplier = currentVoiceUsers.length;
      if (multiplier > maxMultiplier) maxMultiplier = multiplier;

      let coinsSec = 100 * multiplier;
      if (multiplier > 0) {
        for (const uid of currentVoiceUsers) {
          rewards.set(uid, (rewards.get(uid) || 0) + coinsSec);
        }
      }

      ticks++;
      
      if (ticks % 10 === 0 && blackoutMsg) {
         const embedSync = createEmbed(
          "BLACKOUT",
          `\`\`\`\n[SYSTEM ALERTE]\nSurchauffe des terminaux textuels.\nLe Secteur bascule en mode Vocal uniquement.\n\n[STATUS EN DIRECT]\nUtilisateurs en vocal : ${currentVoiceUsers.length}\nMultiplicateur : x${multiplier}\nGains générés : +${coinsSec} coins/sec par membre\nTemps restant : ${60 - ticks}s\n\`\`\``,
          "#000000"
        );
        blackoutMsg.edit({ embeds: [embedSync] }).catch(()=>null);
      }

      if (ticks >= 60) {
        clearInterval(blackoutInterval);
        blackoutActive = false;

        let totalCoinsGained = 0;
        for (const [uid, total] of rewards.entries()) {
          db.updateBalance(uid, total, "Survie Blackout Vocal").catch(()=>null);
          totalCoinsGained += total;
        }

        if (channel) {
          const embedEnd = createEmbed(
            "RESTAURATION",
            `\`\`\`\n[SYSTEM] Refroidissement terminé.\nTerminaux textuels de nouveau opérationnels.\n\n[RÉCOMPENSES VOCALES]\nFinancement maximum atteint : x${maxMultiplier}\nTotal distribué : ${totalCoinsGained} coins aux participants vocaux.\n\`\`\``,
            "#FFFFFF"
          );
          channel.send({ embeds: [embedEnd] }).catch(()=>null);
        }
      }
    }, 1000);
  },

  triggerAuthControl: async (client, db) => {
    if (!doubleGainActive) return; // Si HDG est déjà fini
    authActive = true;
    authCode = `SEC-${Math.floor(1000 + Math.random() * 9000)}`;

    const channel = await client.channels.fetch(CASINO_CHANNEL_ID).catch(()=>null);
    if (!channel) return;

    const embed = createEmbed(
      "ALERTE SYSTÈME",
      `\`\`\`\n[SYSTEM ALERTE]\nContrôle d'Authentification Requis.\nVeuillez saisir le code d'accès suivant dans les 15 secondes pour maintenir le Secteur actif :\n${authCode}\n\`\`\``,
      "#000000" 
    );

    authMsg = await channel.send({ content: `<@&${ROLE_ID}>`, embeds: [embed] }).catch(()=>null);
    if (!authMsg) return;

    try {
      const filter = m => m.content.trim().toUpperCase() === authCode && !m.author.bot;
      const collected = await channel.awaitMessages({ filter, max: 1, time: 15000, errors: ['time'] });
      
      const winner = collected.first();
      authActive = false;
      
      const successEmbed = createEmbed(
        "SUCCÈS",
        `\`\`\`\n[SYSTEM] Code accepté.\nAuthentification confirmée par l'utilisateur ${winner.author.username}.\nMaintenance du secteur : OK.\n(+500 coins pour la réactivité)\n\`\`\``,
        "#FFFFFF" 
      );
      await authMsg.edit({ embeds: [successEmbed] }).catch(()=>null);
      
      await db.updateBalance(winner.author.id, 500n, "Bonus Authentification HDG").catch(()=>null);
    } catch (err) {
      if (!doubleGainActive) return; // Si fini entre temps
      authActive = false;
      const failEmbed = createEmbed(
        "ÉCHEC",
        `\`\`\`\n[CRITICAL ENTRY] Échec de l'authentification.\nLe délai de 15 secondes est expiré.\nFermeture d'urgence de l'Heure de Gloire dans tout le Secteur.\n\`\`\``,
        "#000000"
      );
      await authMsg.edit({ embeds: [failEmbed] }).catch(()=>null);
      
      module.exports.endGloryHour(client, db);
    }
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
