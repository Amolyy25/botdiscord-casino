const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { COLORS, createEmbed, formatCoins, sendLog } = require('../utils');
const {
  drawMysteryItem,
  RARITY_COLORS,
  RARITY_EMOJIS,
  RARITY_LABELS,
} = require('../mysteryBoxConfig');

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const PRIZE_LABELS = {
  COINS: 'Coins',
  TIRAGES: 'Tirages',
  ROLE: 'Rôle Permanent',
  TEMP_ROLE: 'Rôle Temporaire',
  MYSTERY_BOX: 'Mystery Box',
  NITRO: 'Discord Nitro',
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
    case 'COINS': return `**${BigInt(value).toLocaleString('fr-FR')}** coins`;
    case 'TIRAGES': return `**${value}** tirage(s)`;
    case 'ROLE': return `Rôle <@&${value}>`;
    case 'TEMP_ROLE': {
      const dur = giveaway.temp_role_duration ? formatDuration(parseInt(giveaway.temp_role_duration)) : '?';
      return `Rôle <@&${value}> (${dur})`;
    }
    case 'MYSTERY_BOX': {
      // value = "TYPE:VALEUR:LABEL"
      const label = value.split(':')[2] || value;
      return `**Mystery Box** *(ou ${label} garanti)*`;
    }
    case 'NITRO': return 'Discord Nitro';
    default: return value;
  }
}

/**
 * Parse la valeur d'un giveaway MYSTERY_BOX.
 * Format stocké : "TYPE:VALEUR:LABEL"
 */
function parseMysteryBoxValue(rawValue) {
  const parts = rawValue.split(':');
  return {
    defaultType:  parts[0] || 'COINS',
    defaultValue: parts[1] || '0',
    defaultLabel: parts.slice(2).join(':') || parts[1] || rawValue,
  };
}

function buildGiveawayEmbed(giveaway, participantCount, ended = false, winners = []) {
  const embed = new EmbedBuilder();
  const isMB = giveaway.prize_type === 'MYSTERY_BOX';
  const emoji = '<a:1476213141183660104:1477056275501154304>';

  // SOBER WHITE DESIGN
  embed.setColor('#FFFFFF');

  if (ended) {
    embed.setTitle(`${emoji} Giveaway ${isMB ? 'Mystery Box ' : ''}Terminé`);
    const winnerMentions = winners.length > 0
      ? winners.map(w => `<@${w}>`).join(', ')
      : '*Aucun participant*';
    
    if (isMB) {
      const { defaultLabel } = parseMysteryBoxValue(giveaway.prize_value);
      embed.setDescription(
        `**Gain :** ${defaultLabel}\n` +
        `**Alternative :** Mystery Box\n` +
        `**Gagnants :** ${winnerMentions}`
      );
    } else {
      embed.setDescription(
        `**Gain :** ${prizeDescription(giveaway)}\n` +
        `**Gagnants :** ${winnerMentions}`
      );
    }
  } else {
    const endsAt = Math.floor(parseInt(giveaway.ends_at) / 1000);
    if (isMB) {
      embed.setTitle(`${emoji} Giveaway — Mystery Box`);
      const { defaultLabel } = parseMysteryBoxValue(giveaway.prize_value);
      embed.setDescription(
        `**Gain :** ${defaultLabel}\n` +
        `**Alternative :** Mystery Box\n` +
        `**Temps restant :** <t:${endsAt}:R>\n` +
        `**Gagnants :** ${giveaway.winner_count}`
      );
    } else {
      embed.setTitle(`${emoji} Giveaway`);
      embed.setDescription(
        `**Gain :** ${prizeDescription(giveaway)}\n` +
        `**Temps restant :** <t:${endsAt}:R>\n` +
        `**Gagnants :** ${giveaway.winner_count}`
      );
    }
  }

  embed.setFooter({ text: `ID: #${giveaway.id}` });
  return embed;
}

function buildGiveawayButtons(giveawayId, ended = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_join_${giveawayId}`)
      .setLabel('Participer')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(ended),
    new ButtonBuilder()
      .setCustomId(`giveaway_view_${giveawayId}`)
      .setLabel('Participants')
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
    const guild = _client.guilds.cache.get(giveaway.guild_id);

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

    // ── MYSTERY BOX special flow ──
    if (giveaway.prize_type === 'MYSTERY_BOX') {
      await endGiveawayMysteryBox(giveaway, winners, guild);
      return;
    }

    // ── Normal reward distribution ──
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

    // Send winner announcement
    try {
      const channel = await _client.channels.fetch(giveaway.channel_id).catch(() => null);
      if (channel && winners.length > 0) {
        const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
        await channel.send({
          content: `Félicitations ${winnerMentions} ! Vous avez gagné **${prizeDescription(giveaway)}** !`,
        });
      } else if (channel && winners.length === 0) {
        await channel.send({
          embeds: [createEmbed('Giveaway Terminé', `Aucun participant pour le giveaway #${giveaway.id}.`, '#FFFFFF')],
        });
      }
    } catch (err) {
      console.error(`[Giveaway] Erreur annonce #${giveaway.id}:`, err.message);
    }

    // Log
    if (guild) {
      await sendLog(guild, 'Giveaway Terminé',
        `**Giveaway #${giveaway.id}** terminé.\n` +
        `Récompense : ${prizeDescription(giveaway)}\n` +
        `Gagnants : ${winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'Aucun'}\n` +
        `Participants : ${participants.length}`,
        '#FFFFFF'
      );
    }

    console.log(`[Giveaway] #${giveaway.id} terminé — ${winners.length} gagnant(s) / ${participants.length} participants`);
  } catch (err) {
    console.error(`[Giveaway] Erreur critique fin giveaway #${giveaway.id}:`, err);
  }
}

// ═══════════════════════════════════════════════
// Mystery Box — Fin de giveaway
// ═══════════════════════════════════════════════

async function endGiveawayMysteryBox(giveaway, winners, guild) {
  try {
    const channel = await _client.channels.fetch(giveaway.channel_id).catch(() => null);
    if (!channel) return;

    if (winners.length === 0) {
      await channel.send({
        embeds: [createEmbed('Giveaway Mystery Box Terminé', `Aucun participant.`, '#FFFFFF')],
      });
      return;
    }

    const { defaultType, defaultValue, defaultLabel } = parseMysteryBoxValue(giveaway.prize_value);
    const winnerMentions = winners.map(w => `<@${w}>`).join(', ');

    // For each winner, create a box entry and send choice message in channel
    for (const winnerId of winners) {
      const box = await _db.giveMysteryBox(
        winnerId,
        giveaway.guild_id,
        giveaway.id,
        defaultType,
        defaultValue,
        defaultLabel
      );

      const choiceEmbed = new EmbedBuilder()
        .setTitle('Gain Giveaway Mystery Box')
        .setColor('#FFFFFF')
        .setDescription(
          `Félicitations <@${winnerId}> !\n\n` +
          `Tu as le choix entre deux options :\n\n` +
          `**Récompense garantie :** ${defaultLabel}\n` +
          `**Mystery Box :** Lot mystère possible\n\n` +
          `*Quel risque vas-tu prendre ?*`
        )
        .setFooter({ text: `ID: #${giveaway.id} · Box: #${box.id}` });

      const choiceRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`mb_choose_default_${box.id}`)
          .setLabel(`Prendre : ${defaultLabel}`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`mb_choose_box_${box.id}`)
          .setLabel('Ouvrir la Mystery Box')
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({
        content: `<@${winnerId}>`,
        embeds: [choiceEmbed],
        components: [choiceRow],
      });
    }

    // Log
    if (guild) {
      await sendLog(guild, 'Giveaway Mystery Box Terminé',
        `**Giveaway #${giveaway.id}** terminé.\n` +
        `Gagnants (en attente de choix) : ${winnerMentions}\n` +
        `Récompense garantie : ${defaultLabel}`,
        '#FFFFFF'
      );
    }
    console.log(`[MysteryBox] Giveaway #${giveaway.id} terminé — ${winners.length} gagnant(s) en attente de choix`);
  } catch (err) {
    console.error(`[MysteryBox] Erreur fin giveaway #${giveaway.id}:`, err);
  }
}

// ═══════════════════════════════════════════════
// Mystery Box — Ouverture interactive (animation)
// ═══════════════════════════════════════════════

/**
 * Procède à l'ouverture animée d'une Mystery Box.
 * Édite successivement un message existant (interaction.message ou un message dédié).
 */
async function openMysteryBoxAnimated(interaction, box) {
  // Étapes d'animation
  const steps = [
    { color: '#FFFFFF', title: 'Ouverture de la Mystery Box...', desc: '*La boîte résiste...\n\nPrépare-toi...*' },
    { color: '#FFFFFF', title: 'La boîte tremble...', desc: '**Quelque chose s\'en échappe !**\n\n*Que va-t-il en sortir ?*' },
    { color: '#FFFFFF', title: 'Une lumière s\'en échappe...', desc: '**Le sort est jeté !**\n\n*Ton destin se révèle...*' },
  ];

  // Désactiver les boutons du message de choix
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mb_disabled_default')
      .setLabel('Récompense garantie')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId('mb_disabled_box')
      .setLabel('Mystery Box choisie !')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );

  // Déférer sans ephémère pour pouvoir éditer le message original
  await interaction.deferUpdate();

  // Animation step 1
  const step1 = new EmbedBuilder()
    .setTitle(steps[0].title)
    .setDescription(steps[0].desc)
    .setColor(steps[0].color)
    .setFooter({ text: `Box #${box.id}` })
    .setTimestamp();
  await interaction.editReply({ embeds: [step1], components: [disabledRow] });

  await sleep(1800);

  // Animation step 2
  const step2 = new EmbedBuilder()
    .setTitle(steps[1].title)
    .setDescription(steps[1].desc)
    .setColor(steps[1].color)
    .setFooter({ text: `Box #${box.id}` })
    .setTimestamp();
  await interaction.editReply({ embeds: [step2], components: [disabledRow] });

  await sleep(1800);

  // Animation step 3
  const step3 = new EmbedBuilder()
    .setTitle(steps[2].title)
    .setDescription(steps[2].desc)
    .setColor(steps[2].color)
    .setFooter({ text: `Box #${box.id}` })
    .setTimestamp();
  await interaction.editReply({ embeds: [step3], components: [disabledRow] });

  await sleep(2000);

  // Tirage
  const item = drawMysteryItem();

  // Distribuer la récompense
  const guild = interaction.guild;
  let rewardLog = '';
  try {
    rewardLog = await distributeMysteryReward(item, box.user_id, guild, box.id);
  } catch (err) {
    console.error(`[MysteryBox] Erreur distribution:`, err);
    rewardLog = `Erreur: ${err.message}`;
  }

  // Marquer comme ouverte
  await _db.consumeMysteryBox(box.id);

  // Embed résultat final
  const rarityColor  = RARITY_COLORS[item.rarity];
  const rarityEmoji  = RARITY_EMOJIS[item.rarity];
  const rarityLabel  = RARITY_LABELS[item.rarity];
  const isNitro      = item.type === 'manual';

  const resultEmbed = new EmbedBuilder()
    .setTitle(item.rarity === 'LEGENDAIRE' ? 'LÉGENDAIRE !' : item.rarity === 'EPIQUE' ? 'ÉPIQUE !' : item.rarity === 'RARE' ? 'RARE !' : 'Lot Commun')
    .setDescription(
      `<@${box.user_id}> vient d'ouvrir une Mystery Box !\n\n` +
      `**Lot obtenu :** ${item.name}\n` +
      `${item.description}\n\n` +
      (isNitro ? `> *Un administrateur te contactera pour remettre ta récompense.*` : '') +
      `\n*Rareté : **${rarityLabel}***`
    )
    .setColor('#FFFFFF')
    .setFooter({ text: `ID: #${box.giveaway_id} · Box: #${box.id}` });

  if (item.rarity === 'LEGENDAIRE') {
    resultEmbed.setThumbnail('https://cdn.discordapp.com/emojis/1135068674779725884.gif?v=1&quality=lossless');
  }

  await interaction.editReply({ embeds: [resultEmbed], components: [] });

  // Annonce publique dans le channel du giveaway (même salon que l'interaction)
  try {
    const announceEmbed = new EmbedBuilder()
      .setTitle('Mystery Box ouverte !')
      .setDescription(
        `**<@${box.user_id}>** vient d'ouvrir une Mystery Box :\n\n` +
        `**${item.name}** — *${rarityLabel}*`
      )
      .setColor('#FFFFFF');
    // Le message est déjà dans le bon channel (interaction.channel = channel du giveaway)
    // On envoie un nouveau message visible de tous dans ce même channel
    await interaction.channel.send({ embeds: [announceEmbed] });
  } catch (e) { /* ignore */ }

  // Log admin
  if (guild) {
    await sendLog(guild, `${rarityEmoji} Mystery Box Ouverte`,
      `<@${box.user_id}> a obtenu : **${item.name}** (${rarityLabel})\n${rewardLog}`,
      rarityColor
    ).catch(() => {});
  }

  console.log(`[MysteryBox] Box #${box.id} ouverte par ${box.user_id} → ${item.name} (${item.rarity})`);
}

/**
 * Distribue la récompense d'un item Mystery Box.
 */
async function distributeMysteryReward(item, userId, guild, boxId) {
  switch (item.type) {
    case 'coins': {
      const newBal = await _db.updateBalance(userId, BigInt(item.value), `Mystery Box: ${item.name}`);
      return `+${item.value} coins (nouveau solde: ${newBal})`;
    }
    case 'tirages': {
      const total = await _db.updateTirages(userId, item.value);
      return `+${item.value} tirages (total: ${total})`;
    }
    case 'role': {
      if (!guild) throw new Error('Guild introuvable');
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) throw new Error('Membre introuvable');
      const role = guild.roles.cache.get(item.value);
      if (!role) throw new Error(`Rôle ${item.value} introuvable`);
      await member.roles.add(role);
      return `Rôle ${role.name} ajouté`;
    }
    case 'temp_role': {
      if (!guild) throw new Error('Guild introuvable');
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) throw new Error('Membre introuvable');
      const role = guild.roles.cache.get(item.value);
      if (!role) throw new Error(`Rôle ${item.value} introuvable`);
      await member.roles.add(role);
      const duration = item.duration || 86_400_000;
      await _db.addScheduledTask({
        taskType: 'REMOVE_ROLE',
        guildId: guild.id,
        userId: userId,
        roleId: item.value,
        executeAt: Date.now() + duration,
      });
      return `Rôle temp ${role.name} ajouté (${formatDuration(duration)})`;
    }
    case 'manual':
      // Nitro ou autre récompense manuelle — log et notif admin
      return `Récompense manuelle: ${item.name} — admin devra la distribuer`;
    case 'troll':
      return `Lot troll: ${item.name}`;
    default:
      return 'Type inconnu';
  }
}

/**
 * Helper sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function distributeReward(giveaway, winnerId, guild) {
  const type = giveaway.prize_type;
  const value = giveaway.prize_value;

  switch (type) {
    case 'COINS': {
      const newBal = await _db.updateBalance(winnerId, BigInt(value), 'Giveaway: Gain');
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
    case 'NITRO': {
      return `Gain : Discord Nitro (Manuel : Un administrateur devra le fournir)`;
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
        { name: '🎁 Mystery Box', value: 'MYSTERY_BOX' },
        { name: '💎 Discord Nitro', value: 'NITRO' },
      ))
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
        opt.setName('value')
          .setDescription('Montant (Coins/Tirages), ID du rôle, ou ignorer pour MYSTERY_BOX')
          .setRequired(false))
      .addStringOption(opt =>
        opt.setName('mb_type')
          .setDescription('Pour MYSTERY_BOX : Type de la récompense garantie')
          .setRequired(false)
          .addChoices(
            { name: '🪙 Coins', value: 'COINS' },
            { name: '🎫 Tirages', value: 'TIRAGES' },
            { name: '🎭 Rôle Permanent', value: 'ROLE' },
            { name: '⏳ Rôle Temporaire', value: 'TEMP_ROLE' },
          ))
      .addStringOption(opt =>
        opt.setName('mb_value')
          .setDescription('Pour MYSTERY_BOX : Valeur de la récompense garantie (montant ou ID)')
          .setRequired(false))
      .addStringOption(opt =>
        opt.setName('mb_label')
          .setDescription('Pour MYSTERY_BOX : Label affiché (ex: 5000 coins). Optionnel.')
          .setRequired(false))
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

    // ── Mystery Box: Take default reward ──
    if (id.startsWith('mb_choose_default_')) {
      const boxId = parseInt(id.replace('mb_choose_default_', ''));
      if (isNaN(boxId)) return false;
      try {
        const box = await db.getMysteryBox(boxId);
        if (!box) {
          await interaction.reply({ content: '❌ Box introuvable.', flags: 64 });
          return true;
        }
        if (box.user_id !== interaction.user.id) {
          await interaction.reply({ content: '❌ Cette box ne t\'appartient pas.', flags: 64 });
          return true;
        }
        if (box.status !== 'pending_choice') {
          await interaction.reply({ content: '❌ Tu as déjà fait ton choix pour cette box.', flags: 64 });
          return true;
        }

        // Distribute default reward
        await db.updateMysteryBoxStatus(boxId, 'default_taken');
        const guild = interaction.guild;
        let result = '';
        try {
          // Reuse giveaway distributeReward logic
          const fakeGw = { prize_type: box.default_prize_type, prize_value: box.default_prize_value, temp_role_duration: null, guild_id: box.guild_id };
          result = await distributeReward(fakeGw, box.user_id, guild);
        } catch (err) {
          result = `❌ ${err.message}`;
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ Récompense récupérée !')
          .setDescription(`<@${box.user_id}>, tu as choisi la récompense garantie !\n\n**🏆 ${box.default_prize_label}** → ${result}`)
          .setColor('#43b581')
          .setFooter({ text: `Box #${boxId}` })
          .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });

        await sendLog(interaction.guild, '✅ Mystery Box — Récompense par défaut',
          `<@${box.user_id}> a pris la récompense garantie : **${box.default_prize_label}**\n${result}`,
          '#43b581'
        ).catch(() => {});
      } catch (err) {
        console.error('[MysteryBox] Erreur choix default:', err);
        await interaction.reply({ content: '❌ Une erreur est survenue.', flags: 64 }).catch(() => {});
      }
      return true;
    }

    // ── Mystery Box: Open the box (animated) ──
    if (id.startsWith('mb_choose_box_')) {
      const boxId = parseInt(id.replace('mb_choose_box_', ''));
      if (isNaN(boxId)) return false;
      try {
        const box = await db.getMysteryBox(boxId);
        if (!box) {
          await interaction.reply({ content: '❌ Box introuvable.', flags: 64 });
          return true;
        }
        if (box.user_id !== interaction.user.id) {
          await interaction.reply({ content: '❌ Cette box ne t\'appartient pas.', flags: 64 });
          return true;
        }
        if (box.status !== 'pending_choice') {
          await interaction.reply({ content: '❌ Tu as déjà fait ton choix pour cette box.', flags: 64 });
          return true;
        }

        // Mark box as chosen before animation to prevent double-click
        await db.updateMysteryBoxStatus(boxId, 'box_chosen');

        // Run animated opening
        await openMysteryBoxAnimated(interaction, box);
      } catch (err) {
        console.error('[MysteryBox] Erreur ouverture box:', err);
        await interaction.reply({ content: '❌ Une erreur est survenue lors de l\'ouverture.', flags: 64 }).catch(() => {});
      }
      return true;
    }

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

    if ((type === 'COINS' || type === 'TIRAGES') && (!value || isNaN(parseInt(value)) || parseInt(value) <= 0)) {
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

    // ── MYSTERY_BOX : gérer les options mb_type, mb_value, mb_label ──
    let finalValue = value;
    if (type === 'MYSTERY_BOX') {
      const mbType = interaction.options.getString('mb_type');
      const mbValue = interaction.options.getString('mb_value');
      let mbLabel = interaction.options.getString('mb_label');

      if (!mbType || !mbValue) {
        return interaction.reply({
          content: '❌ Pour une Mystery Box, remplis les champs `mb_type` et `mb_value` (récompense garantie).',
          flags: 64,
        });
      }

      // Générer un label par défaut si vide
      if (!mbLabel) {
        if (mbType === 'COINS') mbLabel = `${mbValue} coins`;
        else if (mbType === 'TIRAGES') mbLabel = `${mbValue} tirages`;
        else if (mbType === 'ROLE' || mbType === 'TEMP_ROLE') {
          const role = interaction.guild.roles.cache.get(mbValue);
          mbLabel = role ? `Rôle ${role.name}` : `Rôle ${mbValue}`;
        }
      }

      finalValue = `${mbType.toUpperCase()}:${mbValue}:${mbLabel}`;
    // Prevent NULL prize_value for NITRO or if somehow missing
    if (type === 'NITRO' && !finalValue) {
      finalValue = 'NITRO_MANUAL';
    }
    
    // Safety fallback for postgres not-null constraint
    const safePrizeValue = finalValue || '---';

    const endsAt = Date.now() + duration;
    const giveaway = await db.createGiveaway({
      guildId: interaction.guild.id,
      channelId: interaction.channel.id,
      messageId: null,
      hostId: interaction.user.id,
      prizeType: type,
      prizeValue: safePrizeValue,
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
          const embed = createEmbed('Giveaway Annulé', `Annulé par <@${interaction.user.id}>.`, '#FFFFFF');
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
    const embed = createEmbed(`Giveaways Actifs (${giveaways.length})`, lines.join('\n'), '#FFFFFF');
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
            await db.updateBalance(winnerId, BigInt(gw.prize_value), 'Giveaway: Gain');
            results.push(`<@${winnerId}>: +${gw.prize_value} coins`);
            break;
          case 'TIRAGES':
            await db.updateTirages(winnerId, parseInt(gw.prize_value));
            results.push(`<@${winnerId}>: +${gw.prize_value} tirages`);
            break;
          case 'ROLE': {
            const member = await guild.members.fetch(winnerId).catch(() => null);
            const role = guild.roles.cache.get(gw.prize_value);
            if (member && role) { await member.roles.add(role); results.push(`<@${winnerId}>: Rôle ${role.name}`); }
            else results.push(`<@${winnerId}>: Erreur (Membre/rôle introuvable)`);
            break;
          }
          case 'TEMP_ROLE': {
            const member = await guild.members.fetch(winnerId).catch(() => null);
            const role = guild.roles.cache.get(gw.prize_value);
            if (member && role) {
              await member.roles.add(role);
              const dur = parseInt(gw.temp_role_duration) || 86_400_000;
              await db.addScheduledTask({ taskType: 'REMOVE_ROLE', guildId: guild.id, userId: winnerId, roleId: gw.prize_value, executeAt: Date.now() + dur });
              results.push(`<@${winnerId}>: Rôle temp ${role.name}`);
            } else results.push(`<@${winnerId}>: Erreur (Membre/rôle introuvable)`);
            break;
          }
          case 'NITRO': {
            results.push(`<@${winnerId}>: Discord Nitro (Manuel)`);
            break;
          }
        }
      } catch (err) { results.push(`<@${winnerId}> → ❌ ${err.message}`); }
    }

    const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
    const emoji = '<a:1476213141183660104:1477056275501154304>';
    const embed = createEmbed(`${emoji} Reroll — Giveaway #${id}`, `**Gagnant(s) :** ${winnerMentions}\n\n**Résultats :**\n${results.join('\n')}`, '#FFFFFF');
    await interaction.editReply({ embeds: [embed] });

    try {
      const channel = await interaction.client.channels.fetch(gw.channel_id).catch(() => null);
      if (channel && channel.id !== interaction.channel.id) {
        await channel.send({ content: `🔄 **Reroll !** Gagnant(s) du giveaway #${id} : ${winnerMentions} !` });
      }
    } catch (e) {}
  },
};
