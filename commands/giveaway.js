const { PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');
const giveawayManager = require('../events/giveawayManager');

const VALID_TYPES = ['COINS', 'TIRAGES', 'ROLE', 'TEMP_ROLE'];

module.exports = {
  name: 'giveaway',
  aliases: ['gw'],
  description: 'Système de giveaway (Admin)',

  async execute(message, args, db) {
    // Admin only
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({
        embeds: [createEmbed('Erreur', 'Permission insuffisante. (Administrateur requis)', COLORS.ERROR)],
      });
    }

    const sub = (args[0] || '').toLowerCase();

    switch (sub) {
      case 'create':
      case 'c':
        return handleCreate(message, args.slice(1), db);
      case 'cancel':
        return handleCancel(message, args.slice(1), db);
      case 'list':
      case 'ls':
        return handleList(message, db);
      case 'reroll':
        return handleReroll(message, args.slice(1), db);
      default:
        return showHelp(message);
    }
  },
};

// ═══════════════════════════════════════════════
// Sub-commands
// ═══════════════════════════════════════════════

async function showHelp(message) {
  const embed = createEmbed(
    '🎉 Giveaway — Aide',
    `**Créer un giveaway :**\n` +
    `\`;giveaway create <type> <valeur> <durée> <nb_gagnants> [durée_rôle]\`\n\n` +
    `**Types :** \`COINS\`, \`TIRAGES\`, \`ROLE\`, \`TEMP_ROLE\`\n` +
    `**Durées :** \`10m\`, \`1h\`, \`2d\`, \`30s\`\n\n` +
    `**Exemples :**\n` +
    `\`;gw create COINS 1000 1h 2\` → 1000 coins, 1h, 2 gagnants\n` +
    `\`;gw create TEMP_ROLE 123456 30m 1 2d\` → Rôle temp 30min, gardé 2j\n\n` +
    `**Autres commandes :**\n` +
    `\`;gw cancel <id>\` — Annuler un giveaway\n` +
    `\`;gw list\` — Voir les giveaways actifs\n` +
    `\`;gw reroll <id>\` — Re-tirer un gagnant`,
    COLORS.PRIMARY
  );
  return message.reply({ embeds: [embed] });
}

async function handleCreate(message, args, db) {
  // ;giveaway create <type> <value> <duration> <winners> [role_duration]
  const type = (args[0] || '').toUpperCase();
  const value = args[1];
  const durationStr = args[2];
  const winnersStr = args[3];
  const roleDurationStr = args[4]; // only for TEMP_ROLE

  // Validate type
  if (!VALID_TYPES.includes(type)) {
    return message.reply({
      embeds: [createEmbed('Erreur', `Type invalide. Choix : \`${VALID_TYPES.join('`, `')}\``, COLORS.ERROR)],
    });
  }

  // Validate value
  if (!value) {
    return message.reply({
      embeds: [createEmbed('Erreur', 'Valeur manquante. (Montant pour COINS/TIRAGES, ID rôle pour ROLE/TEMP_ROLE)', COLORS.ERROR)],
    });
  }

  // Validate numeric value for COINS/TIRAGES
  if ((type === 'COINS' || type === 'TIRAGES') && (isNaN(parseInt(value)) || parseInt(value) <= 0)) {
    return message.reply({
      embeds: [createEmbed('Erreur', 'La valeur doit être un nombre positif.', COLORS.ERROR)],
    });
  }

  // Validate role exists for ROLE/TEMP_ROLE
  if (type === 'ROLE' || type === 'TEMP_ROLE') {
    const role = message.guild.roles.cache.get(value);
    if (!role) {
      return message.reply({
        embeds: [createEmbed('Erreur', `Rôle \`${value}\` introuvable. Utilisez l'ID du rôle.`, COLORS.ERROR)],
      });
    }
    if (message.guild.members.me.roles.highest.position <= role.position) {
      return message.reply({
        embeds: [createEmbed('Erreur', `Je ne peux pas donner le rôle **${role.name}** (hiérarchie insuffisante).`, COLORS.ERROR)],
      });
    }
  }

  // Validate duration
  const duration = giveawayManager.parseDuration(durationStr);
  if (!duration || duration < 10_000) { // min 10s
    return message.reply({
      embeds: [createEmbed('Erreur', 'Durée invalide ou trop courte. Format : `10m`, `1h`, `2d`, `30s` (min 10s)', COLORS.ERROR)],
    });
  }

  // Validate winner count
  const winnerCount = parseInt(winnersStr);
  if (isNaN(winnerCount) || winnerCount < 1 || winnerCount > 20) {
    return message.reply({
      embeds: [createEmbed('Erreur', 'Nombre de gagnants invalide (1-20).', COLORS.ERROR)],
    });
  }

  // Validate TEMP_ROLE duration
  let tempRoleDuration = null;
  if (type === 'TEMP_ROLE') {
    tempRoleDuration = giveawayManager.parseDuration(roleDurationStr);
    if (!tempRoleDuration || tempRoleDuration < 60_000) { // min 1m
      return message.reply({
        embeds: [createEmbed('Erreur', 'Durée du rôle temporaire manquante ou trop courte.\nFormat : `5m`, `1h`, `2d` (min 1m)\n\nSyntaxe : `;gw create TEMP_ROLE <roleId> <durée_gw> <gagnants> <durée_rôle>`', COLORS.ERROR)],
      });
    }
  }

  // Create in DB
  const endsAt = Date.now() + duration;
  const giveaway = await db.createGiveaway({
    guildId: message.guild.id,
    channelId: message.channel.id,
    messageId: null, // will update after sending the embed
    hostId: message.author.id,
    prizeType: type,
    prizeValue: value,
    winnerCount,
    endsAt,
    tempRoleDuration,
  });

  // Build & send embed
  const embed = giveawayManager.buildGiveawayEmbed(giveaway, 0);
  const buttons = giveawayManager.buildGiveawayButtons(giveaway.id);
  const sent = await message.channel.send({ embeds: [embed], components: [buttons] });

  // Save message ID
  await db.updateGiveawayMessage(giveaway.id, sent.id);

  // Confirmation to host
  const confirmEmbed = createEmbed(
    '✅ Giveaway créé',
    `**ID :** #${giveaway.id}\n` +
    `**Récompense :** ${giveawayManager.prizeDescription(giveaway)}\n` +
    `**Fin :** <t:${Math.floor(endsAt / 1000)}:R>\n` +
    `**Gagnants :** ${winnerCount}`,
    COLORS.SUCCESS
  );
  await message.reply({ embeds: [confirmEmbed] });
}

async function handleCancel(message, args, db) {
  const id = parseInt(args[0]);
  if (isNaN(id)) {
    return message.reply({
      embeds: [createEmbed('Usage', '`;gw cancel <id>`', COLORS.ERROR)],
    });
  }

  const gw = await db.getGiveaway(id);
  if (!gw) {
    return message.reply({
      embeds: [createEmbed('Erreur', `Giveaway #${id} introuvable.`, COLORS.ERROR)],
    });
  }
  if (gw.status !== 'active') {
    return message.reply({
      embeds: [createEmbed('Erreur', `Giveaway #${id} est déjà ${gw.status}.`, COLORS.ERROR)],
    });
  }

  await db.cancelGiveaway(id);

  // Update original embed
  try {
    const channel = await message.client.channels.fetch(gw.channel_id).catch(() => null);
    if (channel && gw.message_id) {
      const msg = await channel.messages.fetch(gw.message_id).catch(() => null);
      if (msg) {
        const embed = createEmbed('🚫 Giveaway Annulé', `Ce giveaway a été annulé par <@${message.author.id}>.`, COLORS.ERROR);
        embed.setFooter({ text: `Giveaway #${id}` });
        const buttons = giveawayManager.buildGiveawayButtons(id, true);
        await msg.edit({ embeds: [embed], components: [buttons] }).catch(() => {});
      }
    }
  } catch (e) {}

  await message.reply({
    embeds: [createEmbed('🚫 Annulé', `Giveaway #${id} a été annulé avec succès.`, COLORS.SUCCESS)],
  });
}

async function handleList(message, db) {
  const giveaways = await db.getActiveGiveaways();

  if (giveaways.length === 0) {
    return message.reply({
      embeds: [createEmbed('🎉 Giveaways Actifs', 'Aucun giveaway en cours.', COLORS.PRIMARY)],
    });
  }

  const lines = giveaways.map(gw => {
    const endsAt = Math.floor(parseInt(gw.ends_at) / 1000);
    return `**#${gw.id}** — ${giveawayManager.prizeDescription(gw)} — Fin <t:${endsAt}:R> — ${gw.winner_count} gagnant(s)`;
  });

  const embed = createEmbed(
    `🎉 Giveaways Actifs (${giveaways.length})`,
    lines.join('\n'),
    COLORS.PRIMARY
  );
  return message.reply({ embeds: [embed] });
}

async function handleReroll(message, args, db) {
  const id = parseInt(args[0]);
  if (isNaN(id)) {
    return message.reply({
      embeds: [createEmbed('Usage', '`;gw reroll <id>`', COLORS.ERROR)],
    });
  }

  const gw = await db.getGiveaway(id);
  if (!gw) {
    return message.reply({
      embeds: [createEmbed('Erreur', `Giveaway #${id} introuvable.`, COLORS.ERROR)],
    });
  }
  if (gw.status !== 'ended') {
    return message.reply({
      embeds: [createEmbed('Erreur', `Seuls les giveaways terminés peuvent être re-tirés. (status: ${gw.status})`, COLORS.ERROR)],
    });
  }

  const participants = await db.getGiveawayParticipants(id);
  if (participants.length === 0) {
    return message.reply({
      embeds: [createEmbed('Erreur', 'Aucun participant pour ce giveaway.', COLORS.ERROR)],
    });
  }

  // Pick new winner(s)
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, Math.min(gw.winner_count, shuffled.length));
  const winnerMentions = winners.map(w => `<@${w}>`).join(', ');

  // Distribute rewards
  const guild = message.guild;
  const results = [];
  for (const winnerId of winners) {
    try {
      const giveawayManager = require('../events/giveawayManager');
      // We don't call distributeReward directly since it's not exported,
      // so we replicate the logic here
      switch (gw.prize_type) {
        case 'COINS':
          await db.updateBalance(winnerId, BigInt(gw.prize_value), 'Giveaway: Reroll');
          results.push(`<@${winnerId}> → +${gw.prize_value} coins ✅`);
          break;
        case 'TIRAGES':
          await db.updateTirages(winnerId, parseInt(gw.prize_value));
          results.push(`<@${winnerId}> → +${gw.prize_value} tirages ✅`);
          break;
        case 'ROLE': {
          const member = await guild.members.fetch(winnerId).catch(() => null);
          const role = guild.roles.cache.get(gw.prize_value);
          if (member && role) {
            await member.roles.add(role);
            results.push(`<@${winnerId}> → Rôle ${role.name} ✅`);
          } else {
            results.push(`<@${winnerId}> → ❌ Membre/rôle introuvable`);
          }
          break;
        }
        case 'TEMP_ROLE': {
          const member = await guild.members.fetch(winnerId).catch(() => null);
          const role = guild.roles.cache.get(gw.prize_value);
          if (member && role) {
            await member.roles.add(role);
            const dur = parseInt(gw.temp_role_duration) || 86_400_000;
            await db.addScheduledTask({
              taskType: 'REMOVE_ROLE',
              guildId: guild.id,
              userId: winnerId,
              roleId: gw.prize_value,
              executeAt: Date.now() + dur,
            });
            results.push(`<@${winnerId}> → Rôle temp ${role.name} ✅`);
          } else {
            results.push(`<@${winnerId}> → ❌ Membre/rôle introuvable`);
          }
          break;
        }
      }
    } catch (err) {
      results.push(`<@${winnerId}> → ❌ ${err.message}`);
    }
  }

  const embed = createEmbed(
    '🔄 Reroll — Giveaway #' + id,
    `**Nouveau(x) gagnant(s) :** ${winnerMentions}\n\n` +
    `**Résultats :**\n${results.join('\n')}`,
    COLORS.GOLD
  );
  await message.reply({ embeds: [embed] });

  // Announce in the original channel
  try {
    const channel = await message.client.channels.fetch(gw.channel_id).catch(() => null);
    if (channel && channel.id !== message.channel.id) {
      await channel.send({
        content: `🔄 **Reroll !** Nouveau(x) gagnant(s) du giveaway #${id} : ${winnerMentions} !`,
      });
    }
  } catch (e) {}
}
