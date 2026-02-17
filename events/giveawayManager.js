const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { COLORS, createEmbed, formatCoins, sendLog } = require('../utils');

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const PRIZE_LABELS = {
  COINS: '🪙 Coins',
  TIRAGES: '🎫 Tirages',
  ROLE: '🎭 Rôle Permanent',
  TEMP_ROLE: '⏳ Rôle Temporaire',
};

function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(m|h|d|j|s)$/i);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, j: 86_400_000 };
  return val * (multipliers[unit] || 0);
}

function formatDuration(ms) {
  if (ms <= 0) return '0s';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const parts = [];
  if (d > 0) parts.push(`${d}j`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.length ? parts.join(' ') : '< 1m';
}

function prizeDescription(giveaway) {
  const type = giveaway.prize_type;
  const value = giveaway.prize_value;
  switch (type) {
    case 'COINS': return `**${BigInt(value).toLocaleString('fr-FR')}** coins 🪙`;
    case 'TIRAGES': return `**${value}** tirage(s) 🎫`;
    case 'ROLE': return `Rôle <@&${value}>`;
    case 'TEMP_ROLE': {
      const dur = giveaway.temp_role_duration ? formatDuration(parseInt(giveaway.temp_role_duration)) : '?';
      return `Rôle <@&${value}> (${dur})`;
    }
    default: return value;
  }
}

function buildGiveawayEmbed(giveaway, participantCount, ended = false, winners = []) {
  const embed = new EmbedBuilder().setTimestamp();

  if (ended) {
    embed.setTitle('🎉 Giveaway Terminé !');
    embed.setColor(COLORS.GOLD);
    const winnerMentions = winners.length > 0
      ? winners.map(w => `<@${w}>`).join(', ')
      : '*Aucun participant*';
    embed.setDescription(
      `**Récompense :** ${prizeDescription(giveaway)}\n` +
      `**Gagnant(s) :** ${winnerMentions}\n\n` +
      `Lancé par <@${giveaway.host_id}>`
    );
  } else {
    embed.setTitle('🎉 GIVEAWAY 🎉');
    embed.setColor('#5865F2'); // Discord blurple
    const endsAt = Math.floor(parseInt(giveaway.ends_at) / 1000);
    embed.setDescription(
      `**Récompense :** ${prizeDescription(giveaway)}\n` +
      `**Type :** ${PRIZE_LABELS[giveaway.prize_type] || giveaway.prize_type}\n` +
      `**Fin :** <t:${endsAt}:R> (<t:${endsAt}:f>)\n` +
      `**Gagnant(s) :** ${giveaway.winner_count}\n` +
      `**Participants :** ${participantCount}\n\n` +
      `Lancé par <@${giveaway.host_id}>`
    );
  }

  embed.setFooter({ text: `Giveaway #${giveaway.id}` });
  return embed;
}

function buildGiveawayButtons(giveawayId, ended = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_join_${giveawayId}`)
      .setLabel('Participer')
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(ended),
    new ButtonBuilder()
      .setCustomId(`giveaway_view_${giveawayId}`)
      .setLabel('Voir les participants')
      .setEmoji('👀')
      .setStyle(ButtonStyle.Secondary)
  );
  return row;
}

function pickWinners(participants, count) {
  if (participants.length === 0) return [];
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ═══════════════════════════════════════════════
// Core Manager
// ═══════════════════════════════════════════════

let _client = null;
let _db = null;

async function endGiveaway(giveaway) {
  try {
    const participants = await _db.getGiveawayParticipants(giveaway.id);
    const winners = pickWinners(participants, giveaway.winner_count);

    // Distribute rewards to each winner
    const guild = _client.guilds.cache.get(giveaway.guild_id);
    const rewardResults = [];

    for (const winnerId of winners) {
      try {
        const result = await distributeReward(giveaway, winnerId, guild);
        rewardResults.push({ winnerId, success: true, detail: result });
      } catch (err) {
        console.error(`[Giveaway] Erreur distribution pour ${winnerId}:`, err.message);
        rewardResults.push({ winnerId, success: false, detail: err.message });
      }
    }

    // Mark as ended in DB
    await _db.endGiveaway(giveaway.id);

    // Update the original embed
    try {
      const channel = await _client.channels.fetch(giveaway.channel_id).catch(() => null);
      if (channel && giveaway.message_id) {
        const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
        if (msg) {
          const embed = buildGiveawayEmbed(giveaway, participants.length, true, winners);
          const buttons = buildGiveawayButtons(giveaway.id, true);
          await msg.edit({ embeds: [embed], components: [buttons] }).catch(() => {});
        }
      }
    } catch (err) {
      console.error(`[Giveaway] Erreur update embed #${giveaway.id}:`, err.message);
    }

    // Send winner announcement
    try {
      const channel = await _client.channels.fetch(giveaway.channel_id).catch(() => null);
      if (channel && winners.length > 0) {
        const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
        await channel.send({
          content: `🎉 Félicitations ${winnerMentions} ! Vous avez gagné **${prizeDescription(giveaway)}** !`,
        });
      } else if (channel && winners.length === 0) {
        await channel.send({
          embeds: [createEmbed('🎉 Giveaway Terminé', `Aucun participant pour le giveaway #${giveaway.id}.`, COLORS.GOLD)],
        });
      }
    } catch (err) {
      console.error(`[Giveaway] Erreur annonce #${giveaway.id}:`, err.message);
    }

    // Log
    if (guild) {
      await sendLog(guild, '🎉 Giveaway Terminé', 
        `**Giveaway #${giveaway.id}** terminé.\n` +
        `Récompense : ${prizeDescription(giveaway)}\n` +
        `Gagnants : ${winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'Aucun'}\n` +
        `Participants : ${participants.length}`,
        COLORS.GOLD
      );
    }

    console.log(`[Giveaway] #${giveaway.id} terminé — ${winners.length} gagnant(s) / ${participants.length} participants`);
  } catch (err) {
    console.error(`[Giveaway] Erreur critique fin giveaway #${giveaway.id}:`, err);
  }
}

async function distributeReward(giveaway, winnerId, guild) {
  const type = giveaway.prize_type;
  const value = giveaway.prize_value;

  switch (type) {
    case 'COINS': {
      const newBal = await _db.updateBalance(winnerId, BigInt(value));
      return `+${value} coins (nouveau solde: ${newBal})`;
    }

    case 'TIRAGES': {
      const newTotal = await _db.updateTirages(winnerId, parseInt(value));
      return `+${value} tirages (total: ${newTotal})`;
    }

    case 'ROLE': {
      if (!guild) throw new Error('Guild introuvable');
      const member = await guild.members.fetch(winnerId).catch(() => null);
      if (!member) throw new Error('Membre introuvable');
      const role = guild.roles.cache.get(value);
      if (!role) throw new Error(`Rôle ${value} introuvable`);
      if (guild.members.me.roles.highest.position <= role.position) {
        throw new Error(`Je ne peux pas donner le rôle ${role.name} (hiérarchie insuffisante)`);
      }
      await member.roles.add(role);
      return `Rôle ${role.name} ajouté`;
    }

    case 'TEMP_ROLE': {
      if (!guild) throw new Error('Guild introuvable');
      const member = await guild.members.fetch(winnerId).catch(() => null);
      if (!member) throw new Error('Membre introuvable');
      const role = guild.roles.cache.get(value);
      if (!role) throw new Error(`Rôle ${value} introuvable`);
      if (guild.members.me.roles.highest.position <= role.position) {
        throw new Error(`Je ne peux pas donner le rôle ${role.name} (hiérarchie insuffisante)`);
      }
      await member.roles.add(role);

      // Schedule removal
      const duration = parseInt(giveaway.temp_role_duration) || 86_400_000; // default 1d
      await _db.addScheduledTask({
        taskType: 'REMOVE_ROLE',
        guildId: giveaway.guild_id,
        userId: winnerId,
        roleId: value,
        executeAt: Date.now() + duration,
      });
      return `Rôle temp ${role.name} ajouté (retrait dans ${formatDuration(duration)})`;
    }

    default:
      throw new Error(`Type de récompense inconnu: ${type}`);
  }
}

// ═══════════════════════════════════════════════
// Scheduled Task Processor (REMOVE_ROLE etc.)
// ═══════════════════════════════════════════════

async function processScheduledTasks() {
  try {
    const now = Date.now();
    const tasks = await _db.getPendingScheduledTasks(now);

    for (const task of tasks) {
      try {
        if (task.task_type === 'REMOVE_ROLE') {
          const guild = _client.guilds.cache.get(task.guild_id);
          if (!guild) {
            console.log(`[ScheduledTask] Guild ${task.guild_id} introuvable, tâche #${task.id} ignorée`);
            await _db.completeScheduledTask(task.id);
            continue;
          }
          const member = await guild.members.fetch(task.user_id).catch(() => null);
          if (member && member.roles.cache.has(task.role_id)) {
            await member.roles.remove(task.role_id);
            console.log(`[ScheduledTask] Rôle ${task.role_id} retiré de ${member.user.tag}`);
            await sendLog(guild, '⏳ Rôle Giveaway Expiré',
              `Le rôle <@&${task.role_id}> a été retiré de <@${task.user_id}> (giveaway).`,
              COLORS.GOLD
            );
          } else {
            console.log(`[ScheduledTask] Membre ${task.user_id} introuvable ou rôle absent, nettoyage`);
          }
        }
        await _db.completeScheduledTask(task.id);
      } catch (err) {
        console.error(`[ScheduledTask] Erreur tâche #${task.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[ScheduledTask] Erreur globale:', err);
  }
}

// ═══════════════════════════════════════════════
// Giveaway Check Loop
// ═══════════════════════════════════════════════

async function checkGiveaways() {
  try {
    const now = Date.now();
    const activeGiveaways = await _db.getActiveGiveaways();

    for (const gw of activeGiveaways) {
      if (parseInt(gw.ends_at) <= now) {
        await endGiveaway(gw);
      }
    }
  } catch (err) {
    console.error('[Giveaway] Erreur check loop:', err);
  }
}

// ═══════════════════════════════════════════════
// Periodic Embed Update (every 10 minutes)
// ═══════════════════════════════════════════════

async function updateActiveEmbeds() {
  try {
    const activeGiveaways = await _db.getActiveGiveaways();
    for (const gw of activeGiveaways) {
      try {
        if (!gw.message_id || !gw.channel_id) continue;
        const channel = await _client.channels.fetch(gw.channel_id).catch(() => null);
        if (!channel) continue;
        const msg = await channel.messages.fetch(gw.message_id).catch(() => null);
        if (!msg) continue;
        const count = await _db.getGiveawayParticipantCount(gw.id);
        const embed = buildGiveawayEmbed(gw, count);
        await msg.edit({ embeds: [embed] }).catch(() => {});
      } catch (e) {
        // Silently ignore per-giveaway errors
      }
    }
  } catch (err) {
    console.error('[Giveaway] Erreur update embeds:', err);
  }
}

// ═══════════════════════════════════════════════
// Slash Command Definition
// ═══════════════════════════════════════════════

const slashCommand = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Système de giveaway Casino')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('create')
      .setDescription('Créer un nouveau giveaway')
      .addStringOption(opt =>
        opt.setName('type')
          .setDescription('Type de récompense')
          .setRequired(true)
          .addChoices(
            { name: '🪙 Coins', value: 'COINS' },
            { name: '🎫 Tirages', value: 'TIRAGES' },
            { name: '🎭 Rôle Permanent', value: 'ROLE' },
            { name: '⏳ Rôle Temporaire', value: 'TEMP_ROLE' },
          ))
      .addStringOption(opt =>
        opt.setName('value')
          .setDescription('Montant (Coins/Tirages) ou ID du rôle')
          .setRequired(true))
      .addStringOption(opt =>
        opt.setName('duration')
          .setDescription('Durée du giveaway (ex: 10m, 1h, 2d)')
          .setRequired(true))
      .addIntegerOption(opt =>
        opt.setName('winners')
          .setDescription('Nombre de gagnants (1-20)')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(20))
      .addStringOption(opt =>
        opt.setName('role_duration')
          .setDescription('Durée du rôle temporaire (ex: 1h, 2d) — requis pour TEMP_ROLE')
          .setRequired(false))
  )
  .addSubcommand(sub =>
    sub.setName('cancel')
      .setDescription('Annuler un giveaway actif')
      .addIntegerOption(opt =>
        opt.setName('id')
          .setDescription('ID du giveaway à annuler')
          .setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('Voir les giveaways actifs')
  )
  .addSubcommand(sub =>
    sub.setName('reroll')
      .setDescription('Re-tirer un gagnant pour un giveaway terminé')
      .addIntegerOption(opt =>
        opt.setName('id')
          .setDescription('ID du giveaway à re-tirer')
          .setRequired(true))
  );

// ═══════════════════════════════════════════════
// Module Exports
// ═══════════════════════════════════════════════

module.exports = {
  parseDuration,
  formatDuration,
  prizeDescription,
  buildGiveawayEmbed,
  buildGiveawayButtons,

  async init(client, db) {
    _client = client;
    _db = db;

    // ── Startup Recovery ──
    console.log('[Giveaway] Démarrage recovery...');

    // 1. Process expired giveaways
    const activeGiveaways = await db.getActiveGiveaways();
    let recoveredGw = 0;
    for (const gw of activeGiveaways) {
      if (parseInt(gw.ends_at) <= Date.now()) {
        console.log(`[Giveaway] Recovery: giveaway #${gw.id} expiré pendant le downtime, fin immédiate`);
        await endGiveaway(gw);
        recoveredGw++;
      }
    }
    const stillActive = activeGiveaways.length - recoveredGw;
    console.log(`[Giveaway] ${recoveredGw} giveaway(s) récupéré(s), ${stillActive} encore actif(s)`);

    // 2. Process expired scheduled tasks
    await processScheduledTasks();
    const pendingTasks = await db.getAllPendingScheduledTasks();
    if (pendingTasks.length > 0) {
      console.log(`[Giveaway] ${pendingTasks.length} tâche(s) planifiée(s) en attente :`);
      for (const t of pendingTasks) {
        const remaining = Math.max(0, parseInt(t.execute_at) - Date.now());
        console.log(`  - #${t.id} ${t.task_type} user:${t.user_id} dans ${formatDuration(remaining)}`);
      }
    }

    // ── Intervals ──
    setInterval(checkGiveaways, 30_000);        // Check giveaways every 30s
    setInterval(processScheduledTasks, 60_000);  // Check scheduled tasks every 60s
    setInterval(updateActiveEmbeds, 10 * 60_000); // Update embeds every 10 minutes

    console.log('[Giveaway] Système initialisé · check giveaways/30s · scheduled tasks/60s · embed update/10m · persistence DB active');
  },

  async handleInteraction(interaction, db) {
    if (!interaction.isButton()) return false;
    const id = interaction.customId;

    // ── Join button ──
    if (id.startsWith('giveaway_join_')) {
      const giveawayId = parseInt(id.replace('giveaway_join_', ''));
      if (isNaN(giveawayId)) return false;

      try {
        const gw = await db.getGiveaway(giveawayId);
        if (!gw || gw.status !== 'active') {
          await interaction.reply({ content: '❌ Ce giveaway est terminé ou n\'existe plus.', flags: 64 });
          return true;
        }

        const added = await db.addGiveawayParticipant(giveawayId, interaction.user.id);
        if (added) {
          const count = await db.getGiveawayParticipantCount(giveawayId);
          await interaction.reply({ content: `🎉 Tu participes au giveaway ! (**${count}** participant${count > 1 ? 's' : ''})`, flags: 64 });

          // Update embed participant count periodically (throttle: every 5 new participants)
          if (count % 5 === 0 || count <= 3) {
            try {
              const channel = await interaction.client.channels.fetch(gw.channel_id).catch(() => null);
              if (channel && gw.message_id) {
                const msg = await channel.messages.fetch(gw.message_id).catch(() => null);
                if (msg) {
                  const embed = buildGiveawayEmbed(gw, count);
                  await msg.edit({ embeds: [embed] }).catch(() => {});
                }
              }
            } catch (e) {}
          }
        } else {
          await interaction.reply({ content: '⚠️ Tu participes déjà à ce giveaway !', flags: 64 });
        }
      } catch (err) {
        console.error('[Giveaway] Erreur join:', err);
        await interaction.reply({ content: '❌ Une erreur est survenue.', flags: 64 }).catch(() => {});
      }
      return true;
    }

    // ── View participants button ──
    if (id.startsWith('giveaway_view_')) {
      const giveawayId = parseInt(id.replace('giveaway_view_', ''));
      if (isNaN(giveawayId)) return false;

      try {
        const participants = await db.getGiveawayParticipants(giveawayId);
        const total = participants.length;

        if (total === 0) {
          await interaction.reply({ content: '👀 Aucun participant pour le moment.', flags: 64 });
          return true;
        }

        const MAX_DISPLAY = 50;
        const displayed = participants.slice(0, MAX_DISPLAY);
        let list = displayed.map(uid => `<@${uid}>`).join('\n');
        if (total > MAX_DISPLAY) {
          list += `\n\n...et **${total - MAX_DISPLAY}** autre(s)`;
        }

        const embed = new EmbedBuilder()
          .setTitle(`👀 Participants (${total})`)
          .setDescription(list)
          .setColor('#5865F2')
          .setFooter({ text: `Giveaway #${giveawayId}` });

        await interaction.reply({ embeds: [embed], flags: 64 });
      } catch (err) {
        console.error('[Giveaway] Erreur view:', err);
        await interaction.reply({ content: '❌ Une erreur est survenue.', flags: 64 }).catch(() => {});
      }
      return true;
    }

    return false;
  },

  // ═══════════════════════════════════════════════
  // Slash Command
  // ═══════════════════════════════════════════════

  slashCommand,

  async handleSlashCommand(interaction, db) {
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'create': return this._slashCreate(interaction, db);
      case 'cancel': return this._slashCancel(interaction, db);
      case 'list':   return this._slashList(interaction, db);
      case 'reroll': return this._slashReroll(interaction, db);
    }
  },

  async _slashCreate(interaction, db) {
    const type = interaction.options.getString('type');
    const value = interaction.options.getString('value');
    const durationStr = interaction.options.getString('duration');
    const winnerCount = interaction.options.getInteger('winners');
    const roleDurationStr = interaction.options.getString('role_duration');

    if ((type === 'COINS' || type === 'TIRAGES') && (isNaN(parseInt(value)) || parseInt(value) <= 0)) {
      return interaction.reply({ content: '❌ La valeur doit être un nombre positif.', flags: 64 });
    }

    if (type === 'ROLE' || type === 'TEMP_ROLE') {
      const role = interaction.guild.roles.cache.get(value);
      if (!role) return interaction.reply({ content: `❌ Rôle \`${value}\` introuvable.`, flags: 64 });
      if (interaction.guild.members.me.roles.highest.position <= role.position) {
        return interaction.reply({ content: `❌ Hiérarchie insuffisante pour le rôle **${role.name}**.`, flags: 64 });
      }
    }

    const duration = parseDuration(durationStr);
    if (!duration || duration < 10_000) {
      return interaction.reply({ content: '❌ Durée invalide. Format : `10m`, `1h`, `2d` (min 10s)', flags: 64 });
    }

    let tempRoleDuration = null;
    if (type === 'TEMP_ROLE') {
      tempRoleDuration = parseDuration(roleDurationStr);
      if (!tempRoleDuration || tempRoleDuration < 60_000) {
        return interaction.reply({ content: '❌ Durée du rôle temporaire manquante ou trop courte (min 1m). Paramètre `role_duration`.', flags: 64 });
      }
    }

    const endsAt = Date.now() + duration;
    const giveaway = await db.createGiveaway({
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      messageId: null,
      hostId: interaction.user.id,
      prizeType: type,
      prizeValue: value,
      winnerCount,
      endsAt,
      tempRoleDuration,
    });

    const embed = buildGiveawayEmbed(giveaway, 0);
    const buttons = buildGiveawayButtons(giveaway.id);
    const sent = await interaction.channel.send({ embeds: [embed], components: [buttons] });
    await db.updateGiveawayMessage(giveaway.id, sent.id);

    await interaction.reply({
      content: `✅ Giveaway **#${giveaway.id}** créé ! Fin <t:${Math.floor(endsAt / 1000)}:R>`,
      flags: 64,
    });
  },

  async _slashCancel(interaction, db) {
    const id = interaction.options.getInteger('id');
    const gw = await db.getGiveaway(id);
    if (!gw) return interaction.reply({ content: `❌ Giveaway #${id} introuvable.`, flags: 64 });
    if (gw.status !== 'active') return interaction.reply({ content: `❌ Giveaway #${id} est déjà ${gw.status}.`, flags: 64 });

    await db.cancelGiveaway(id);
    try {
      const channel = await interaction.client.channels.fetch(gw.channel_id).catch(() => null);
      if (channel && gw.message_id) {
        const msg = await channel.messages.fetch(gw.message_id).catch(() => null);
        if (msg) {
          const embed = createEmbed('🚫 Giveaway Annulé', `Annulé par <@${interaction.user.id}>.`, COLORS.ERROR);
          embed.setFooter({ text: `Giveaway #${id}` });
          await msg.edit({ embeds: [embed], components: [buildGiveawayButtons(id, true)] }).catch(() => {});
        }
      }
    } catch (e) {}
    await interaction.reply({ content: `✅ Giveaway #${id} annulé.`, flags: 64 });
  },

  async _slashList(interaction, db) {
    const giveaways = await db.getActiveGiveaways();
    if (giveaways.length === 0) return interaction.reply({ content: 'Aucun giveaway actif.', flags: 64 });

    const lines = giveaways.map(gw => {
      const endsAt = Math.floor(parseInt(gw.ends_at) / 1000);
      return `**#${gw.id}** — ${prizeDescription(gw)} — Fin <t:${endsAt}:R> — ${gw.winner_count} gagnant(s)`;
    });
    const embed = createEmbed(`🎉 Giveaways Actifs (${giveaways.length})`, lines.join('\n'), COLORS.PRIMARY);
    await interaction.reply({ embeds: [embed], flags: 64 });
  },

  async _slashReroll(interaction, db) {
    const id = interaction.options.getInteger('id');
    const gw = await db.getGiveaway(id);
    if (!gw) return interaction.reply({ content: `❌ Giveaway #${id} introuvable.`, flags: 64 });
    if (gw.status !== 'ended') return interaction.reply({ content: '❌ Seuls les giveaways terminés peuvent être re-tirés.', flags: 64 });

    const participants = await db.getGiveawayParticipants(id);
    if (participants.length === 0) return interaction.reply({ content: '❌ Aucun participant.', flags: 64 });

    await interaction.deferReply();

    const winners = pickWinners(participants, gw.winner_count);
    const results = [];
    const guild = interaction.guild;

    for (const winnerId of winners) {
      try {
        switch (gw.prize_type) {
          case 'COINS':
            await db.updateBalance(winnerId, BigInt(gw.prize_value));
            results.push(`<@${winnerId}> → +${gw.prize_value} coins ✅`);
            break;
          case 'TIRAGES':
            await db.updateTirages(winnerId, parseInt(gw.prize_value));
            results.push(`<@${winnerId}> → +${gw.prize_value} tirages ✅`);
            break;
          case 'ROLE': {
            const member = await guild.members.fetch(winnerId).catch(() => null);
            const role = guild.roles.cache.get(gw.prize_value);
            if (member && role) { await member.roles.add(role); results.push(`<@${winnerId}> → Rôle ${role.name} ✅`); }
            else results.push(`<@${winnerId}> → ❌ Membre/rôle introuvable`);
            break;
          }
          case 'TEMP_ROLE': {
            const member = await guild.members.fetch(winnerId).catch(() => null);
            const role = guild.roles.cache.get(gw.prize_value);
            if (member && role) {
              await member.roles.add(role);
              const dur = parseInt(gw.temp_role_duration) || 86_400_000;
              await db.addScheduledTask({ taskType: 'REMOVE_ROLE', guildId: guild.id, userId: winnerId, roleId: gw.prize_value, executeAt: Date.now() + dur });
              results.push(`<@${winnerId}> → Rôle temp ${role.name} ✅`);
            } else results.push(`<@${winnerId}> → ❌ Membre/rôle introuvable`);
            break;
          }
        }
      } catch (err) { results.push(`<@${winnerId}> → ❌ ${err.message}`); }
    }

    const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
    const embed = createEmbed(`🔄 Reroll — Giveaway #${id}`, `**Gagnant(s) :** ${winnerMentions}\n\n**Résultats :**\n${results.join('\n')}`, COLORS.GOLD);
    await interaction.editReply({ embeds: [embed] });

    try {
      const channel = await interaction.client.channels.fetch(gw.channel_id).catch(() => null);
      if (channel && channel.id !== interaction.channel.id) {
        await channel.send({ content: `🔄 **Reroll !** Gagnant(s) du giveaway #${id} : ${winnerMentions} !` });
      }
    } catch (e) {}
  },
};
