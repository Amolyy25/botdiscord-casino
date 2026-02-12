const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { createEmbed, COLORS, formatCoins } = require("../utils");
const shopData = require("../shop.json");

// ─── Helpers ────────────────────────────────────────────────

function getItem(itemId) {
  return shopData.items.find((i) => i.id === itemId);
}

function getCategory(categoryId) {
  return shopData.categories.find((c) => c.id === categoryId);
}

function getItemsByCategory(categoryId) {
  return shopData.items.filter((i) => i.category === categoryId);
}

function formatDuration(ms) {
  if (!ms) return "Permanent";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}

function getTypeLabel(type) {
  const labels = {
    temp_role: "🎭 Rôle temporaire",
    timeout: "🤐 Mute (timeout)",
    nickname: "📝 Changement de surnom",
    permanent_role: "👑 Rôle permanent",
    role_select: "🌈 Rôle au choix",
    xp_boost: "✨ Boost d'XP",
    ticket: "🎫 Ticket",
    tirage: "🎫 Tirage",
    shop_effect: "⚡ Effet spécial",
  };
  return labels[type] || type;
}

// ─── Build embeds & components ──────────────────────────────

function buildCategoryItemsEmbed(categoryId) {
  const category = getCategory(categoryId);
  const items = getItemsByCategory(categoryId);

  let itemsList = "";
  for (const item of items) {
    const durationStr = item.duration
      ? ` • ⏱️ ${formatDuration(item.duration)}`
      : "";
    const targetStr = item.needsTarget ? " • 🎯 Cible requise" : "";
    itemsList +=
      `${item.emoji} **${item.label}**\n` +
      `┗ ${formatCoins(item.price)}${durationStr}${targetStr}\n\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.label}`)
    .setDescription(
      `${category.description}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        itemsList +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💡 *Sélectionnez un article pour voir les détails.*`,
    )
    .setColor(category.color)
    .setTimestamp();

  const itemOptions = items.map((item) => ({
    label: item.label,
    value: item.id,
    description: `${item.price} coins${item.duration ? ` • ${formatDuration(item.duration)}` : ""}`,
    emoji: item.emoji,
  }));

  const itemSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("shop_items")
      .setPlaceholder("🛒 Choisir un article...")
      .addOptions(itemOptions),
  );

  return { embed, components: [itemSelect] };
}

function buildItemDetailEmbed(itemId) {
  const item = getItem(itemId);
  const category = getCategory(item.category);

  const fields = [
    { name: "💰 Prix", value: formatCoins(item.price), inline: true },
  ];

  if (item.duration) {
    fields.push({
      name: "⏱️ Durée",
      value: formatDuration(item.duration),
      inline: true,
    });
  }

  fields.push({ name: "📦 Type", value: getTypeLabel(item.type), inline: true });

  if (item.needsTarget) {
    fields.push({
      name: "🎯 Cible",
      value: "Un joueur de votre choix",
      inline: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(`${item.emoji} ${item.label}`)
    .setDescription(item.description)
    .setColor(category.color)
    .addFields(fields)
    .setFooter({ text: `Catégorie : ${category.label}` })
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_confirm.${itemId}`)
      .setLabel("Confirmer l'achat")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🛒"),
    new ButtonBuilder()
      .setCustomId(`shop_back.${item.category}`)
      .setLabel("Retour")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("◀"),
    new ButtonBuilder()
      .setCustomId("shop_cancel")
      .setLabel("Annuler")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
  );

  return { embed, components: [buttons] };
}

// ─── Purchase processing ────────────────────────────────────

async function processPurchase(interaction, item, db, targetId = null, extraData = null) {
  const userId = interaction.user.id;

  // Vérifier le solde
  const userData = await db.getUser(userId);
  const balance = BigInt(userData.balance);
  const price = BigInt(item.price);

  if (balance < price) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Solde insuffisant")
      .setDescription(
        `Vous avez besoin de ${formatCoins(item.price)} mais vous n'avez que ${formatCoins(userData.balance)}.\n\n` +
          `💡 Gagnez des coins avec les jeux du casino !`,
      )
      .setColor(COLORS.ERROR)
      .setTimestamp();

    // Selon le type d'interaction, reply ou update
    if (interaction.isModalSubmit()) {
      return interaction.reply({ embeds: [errorEmbed], flags: 64 });
    }
    return interaction.update({ embeds: [errorEmbed], components: [] });
  }

  // Déduire les coins
  const newBalance = await db.updateBalance(userId, -item.price);

  // Enregistrer l'achat
  await db.addShopPurchase(userId, item.id, targetId, item.price);

  // Appliquer l'effet selon le type
  let effectDescription = "";

  try {
    switch (item.type) {
      case "temp_role": {
        const guild = interaction.guild;
        // Le rôle peut cibler quelqu'un d'autre OU soi-même
        const roleTargetId = item.needsTarget ? targetId : userId;
        const member = await guild.members.fetch(roleTargetId).catch(() => null);

        if (!member) {
          await db.updateBalance(userId, item.price); // Remboursement
          return sendError(interaction, "Le membre ciblé est introuvable. Vous avez été remboursé.");
        }

        if (member.roles.cache.has(item.roleId)) {
          await db.updateBalance(userId, item.price); // Remboursement
          const msg = item.needsTarget
            ? `<@${roleTargetId}> possède déjà ce rôle. Vous avez été remboursé.`
            : "Vous possédez déjà ce rôle ! Vous avez été remboursé.";
          return sendError(interaction, msg);
        }

        await member.roles.add(item.roleId).catch(async (err) => {
          console.error("Erreur ajout rôle shop:", err);
          await db.updateBalance(userId, item.price); // Remboursement
          throw new Error("Impossible d'ajouter le rôle. Vérifiez les permissions du bot.");
        });

        const expiresAt = Date.now() + item.duration;
        await db.addRoleExpiration(roleTargetId, item.roleId, expiresAt);

        if (item.needsTarget) {
          effectDescription = `<@${roleTargetId}> a reçu le rôle <@&${item.roleId}> pour **${formatDuration(item.duration)}** !`;
        } else {
          effectDescription = `Vous avez obtenu le rôle <@&${item.roleId}> pour **${formatDuration(item.duration)}** !`;
        }
        break;
      }

      case "timeout": {
        const guild = interaction.guild;
        const member = await guild.members.fetch(targetId).catch(() => null);

        if (!member) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Le membre ciblé est introuvable. Vous avez été remboursé.");
        }

        if (!member.moderatable) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Impossible de mute ce membre (permissions insuffisantes du bot). Vous avez été remboursé.");
        }

        if (member.isCommunicationDisabled()) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, `<@${targetId}> est déjà mute ! Vous avez été remboursé.`);
        }

        const reason = `🛒 Boutique — Acheté par ${interaction.user.username} (${formatDuration(item.duration)})`;

        // Timeout Discord natif
        await member.timeout(item.duration, reason).catch(async (err) => {
          console.error("Erreur timeout shop:", err);
          await db.updateBalance(userId, item.price);
          throw new Error("Impossible de mute ce membre. Vérifiez les permissions du bot.");
        });

        // Envoyer un MP à la victime
        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle("🤐 Vous avez été rendu muet !")
            .setDescription(
              `Un joueur a utilisé la **Boutique du Casino** pour vous rendre muet.\n\n` +
                `⏱️ **Durée :** ${formatDuration(item.duration)}\n` +
                `📝 **Raison :** Achat en boutique par **${interaction.user.username}**\n\n` +
                `Vous retrouverez la parole automatiquement à la fin du délai.`,
            )
            .setColor(COLORS.ERROR)
            .setTimestamp();

          await member.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch (e) {
          // MP désactivés, on continue
        }

        effectDescription = `<@${targetId}> a été rendu muet pour **${formatDuration(item.duration)}** ! Un MP lui a été envoyé.`;
        break;
      }

      case "nickname": {
        const guild = interaction.guild;
        const member = await guild.members.fetch(targetId).catch(() => null);

        if (!member) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Le membre ciblé est introuvable. Vous avez été remboursé.");
        }

        // Sauvegarder l'ancien surnom
        const oldNickname = member.nickname || member.user.displayName;

        // Changer le surnom
        const newNickname = extraData || "Le Soumis du Casino";
        await member.setNickname(newNickname).catch(async (err) => {
          console.error("Erreur changement surnom shop:", err);
          await db.updateBalance(userId, item.price);
          throw new Error("Impossible de changer le surnom. Vérifiez les permissions du bot.");
        });

        // Stocker l'effet pour reversion automatique
        const expiresAt = Date.now() + item.duration;
        await db.addShopEffect(targetId, userId, "nickname", newNickname, oldNickname, expiresAt);

        effectDescription = `Le surnom de <@${targetId}> a été changé en **"${newNickname}"** pour **${formatDuration(item.duration)}** !`;
        break;
      }

      case "permanent_role": {
        const prMember = await interaction.guild.members
          .fetch(userId)
          .catch(() => null);

        if (!prMember) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Impossible de vous trouver. Vous avez été remboursé.");
        }

        if (prMember.roles.cache.has(item.roleId)) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Vous possédez déjà ce rôle ! Vous avez été remboursé.");
        }

        await prMember.roles.add(item.roleId).catch(async (err) => {
          console.error("Erreur ajout rôle permanent shop:", err);
          await db.updateBalance(userId, item.price);
          throw new Error("Impossible d'ajouter le rôle. Vérifiez les permissions du bot.");
        });

        effectDescription = `Vous avez obtenu le rôle <@&${item.roleId}> de manière **permanente** !`;
        break;
      }

      case "role_select": {
        // extraData contient l'ID du rôle choisi par l'utilisateur
        const selectedRoleId = extraData;

        if (!selectedRoleId) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Aucun rôle sélectionné. Vous avez été remboursé.");
        }

        const rsMember = await interaction.guild.members
          .fetch(userId)
          .catch(() => null);

        if (!rsMember) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Impossible de vous trouver. Vous avez été remboursé.");
        }

        if (rsMember.roles.cache.has(selectedRoleId)) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Vous possédez déjà ce rôle ! Vous avez été remboursé.");
        }

        await rsMember.roles.add(selectedRoleId).catch(async (err) => {
          console.error("Erreur ajout rôle select shop:", err);
          await db.updateBalance(userId, item.price);
          throw new Error("Impossible d'ajouter le rôle. Vérifiez les permissions du bot.");
        });

        const expiresAtRS = Date.now() + item.duration;
        await db.addRoleExpiration(userId, selectedRoleId, expiresAtRS);

        const selectedRoleLabel = item.roles?.find((r) => r.id === selectedRoleId)?.label || "Inconnu";
        effectDescription = `Vous avez obtenu le rôle couleur **${selectedRoleLabel}** (<@&${selectedRoleId}>) pour **${formatDuration(item.duration)}** !`;
        break;
      }

      case "xp_boost": {
        const expiresAt = Date.now() + item.duration;
        await db.addShopEffect(userId, null, "xp_boost", item.value.toString(), null, expiresAt);

        effectDescription = `Boost XP **+${item.value}%** activé pour **${formatDuration(item.duration)}** !`;
        break;
      }

      case "ticket": {
        const categoryChannelId = "1469071692172361836";
        const safeUsername = interaction.user.username
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 20);

        const channel = await interaction.guild.channels.create({
          name: `emoji-${safeUsername}`,
          type: 0,
          parent: categoryChannelId,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: ["ViewChannel"],
            },
            {
              id: interaction.user.id,
              allow: ["ViewChannel", "SendMessages"],
            },
            {
              id: "1469071689848721510", // Staff Role
              allow: ["ViewChannel", "SendMessages"],
            },
          ],
        });

        const ticketEmbed = createEmbed(
          "🎨 Demande d'Emoji Personnalisé",
          `<@${userId}>, bienvenue dans votre ticket !\n\n` +
            `📝 **Décrivez l'emoji que vous souhaitez :**\n` +
            `• Envoyez une image ou un lien vers l'image\n` +
            `• Précisez le nom souhaité pour l'emoji\n\n` +
            `Un administrateur viendra traiter votre demande. 🎨`,
          COLORS.VIOLET,
        );

        await channel.send({
          content: `<@${userId}>`,
          embeds: [ticketEmbed],
        });

        effectDescription = `Ticket créé : ${channel}\nUn admin traitera votre demande d'emoji personnalisé !`;
        break;
      }

      case "tirage": {
        // Ajouter des tirages au joueur
        const newTirages = await db.updateTirages(userId, 1);
        effectDescription = `Vous avez reçu **1 tirage** supplémentaire ! Vous en avez maintenant **${newTirages}**.`;
        break;
      }

      case "shop_effect": {
        // Vérifier si l'utilisateur a déjà cet effet actif
        const hasEffect = await db.hasActiveShopEffect(userId, item.value);
        if (hasEffect) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, `Vous avez déjà l'effet **${item.label}** actif. Vous avez été remboursé.`);
        }

        const expiresAt = item.duration ? Date.now() + item.duration : null;
        await db.addShopEffect(userId, null, item.value, null, null, expiresAt);

        if (item.duration) {
          effectDescription = `Effet **${item.label}** activé pour **${formatDuration(item.duration)}** !`;
        } else {
          effectDescription = `Effet **${item.label}** activé *(usage unique)* !`;
        }
        break;
      }

      default: {
        await db.updateBalance(userId, item.price);
        return sendError(interaction, `Type d'article inconnu : ${item.type}. Vous avez été remboursé.`);
      }
    }
  } catch (error) {
    console.error("Erreur application effet shop:", error);
    return sendError(interaction, error.message || "Une erreur est survenue lors de l'application de l'effet.");
  }

  // Embed de succès
  const successEmbed = new EmbedBuilder()
    .setTitle("✅ Achat réussi !")
    .setDescription(
      `Vous avez acheté **${item.emoji} ${item.label}** pour ${formatCoins(item.price)}.\n\n` +
        `${effectDescription}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 **Nouveau solde :** ${formatCoins(newBalance)}`,
    )
    .setColor(COLORS.SUCCESS)
    .setTimestamp();

  if (interaction.isModalSubmit()) {
    return interaction.reply({ embeds: [successEmbed], flags: 64 });
  }
  return interaction.update({ embeds: [successEmbed], components: [] });
}

function sendError(interaction, message) {
  const errorEmbed = new EmbedBuilder()
    .setTitle("❌ Erreur")
    .setDescription(message)
    .setColor(COLORS.ERROR)
    .setTimestamp();

  if (interaction.isModalSubmit()) {
    return interaction.reply({ embeds: [errorEmbed], flags: 64 });
  }
  return interaction.update({ embeds: [errorEmbed], components: [] });
}

// ─── Interaction Handler ────────────────────────────────────

module.exports = {
  /**
   * Gère toutes les interactions liées à la boutique.
   * Retourne true si l'interaction a été traitée, false sinon.
   */
  async handleInteraction(interaction, db) {
    const customId = interaction.customId;
    if (!customId?.startsWith("shop_")) return false;

    try {
      // ── Sélection de catégorie (message public) ──
      if (interaction.isStringSelectMenu() && customId === "shop_category") {
        const categoryId = interaction.values[0];
        const { embed, components } = buildCategoryItemsEmbed(categoryId);

        await interaction.reply({
          embeds: [embed],
          components,
          flags: 64, // EPHEMERAL
        });
        return true;
      }

      // ── Sélection d'article (message éphémère) ──
      if (interaction.isStringSelectMenu() && customId === "shop_items") {
        const itemId = interaction.values[0];
        const { embed, components } = buildItemDetailEmbed(itemId);

        await interaction.update({
          embeds: [embed],
          components,
        });
        return true;
      }

      // ── Confirmation d'achat ──
      if (interaction.isButton() && customId.startsWith("shop_confirm.")) {
        const itemId = customId.split(".")[1];
        const item = getItem(itemId);

        if (!item) {
          return sendError(interaction, "Article introuvable."), true;
        }

        // Si l'article nécessite une cible
        if (item.needsTarget) {
          const targetEmbed = new EmbedBuilder()
            .setTitle(`🎯 Choisir une cible — ${item.emoji} ${item.label}`)
            .setDescription(
              `Sélectionnez le joueur sur qui appliquer l'effet.\n\n` +
                `💰 **Prix :** ${formatCoins(item.price)}\n` +
                `⏱️ **Durée :** ${formatDuration(item.duration)}`,
            )
            .setColor(COLORS.GOLD)
            .setTimestamp();

          const targetSelect = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId(`shop_target.${itemId}`)
              .setPlaceholder("🎯 Sélectionner un joueur...")
              .setMinValues(1)
              .setMaxValues(1),
          );

          const cancelRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("shop_cancel")
              .setLabel("Annuler")
              .setStyle(ButtonStyle.Danger)
              .setEmoji("❌"),
          );

          await interaction.update({
            embeds: [targetEmbed],
            components: [targetSelect, cancelRow],
          });
          return true;
        }

        // Si c'est un role_select, afficher le menu de choix de rôle
        if (item.type === "role_select" && item.roles?.length > 0) {
          const roleOptions = item.roles.map((role) => ({
            label: role.label,
            value: role.id,
            emoji: role.emoji,
          }));

          const roleSelectEmbed = new EmbedBuilder()
            .setTitle(`🌈 Choisissez votre couleur — ${item.emoji} ${item.label}`)
            .setDescription(
              `Sélectionnez le rôle couleur que vous souhaitez.\n\n` +
                `💰 **Prix :** ${formatCoins(item.price)}\n` +
                `⏱️ **Durée :** ${formatDuration(item.duration)}\n\n` +
                `💡 *Les coins seront déduits après votre choix.*`,
            )
            .setColor(COLORS.GOLD)
            .setTimestamp();

          const roleSelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`shop_roleselect.${itemId}`)
              .setPlaceholder("🌈 Choisir une couleur...")
              .addOptions(roleOptions),
          );

          const cancelRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("shop_cancel")
              .setLabel("Annuler")
              .setStyle(ButtonStyle.Danger)
              .setEmoji("❌"),
          );

          await interaction.update({
            embeds: [roleSelectEmbed],
            components: [roleSelect, cancelRow],
          });
          return true;
        }

        // Pas de cible : achat direct
        await processPurchase(interaction, item, db);
        return true;
      }

      // ── Sélection de rôle couleur (StringSelectMenu) ──
      if (interaction.isStringSelectMenu() && customId.startsWith("shop_roleselect.")) {
        const itemId = customId.split(".")[1];
        const item = getItem(itemId);
        const selectedRoleId = interaction.values[0];

        if (!item) {
          return sendError(interaction, "Article introuvable."), true;
        }

        // processPurchase avec le roleId choisi dans extraData
        await processPurchase(interaction, item, db, null, selectedRoleId);
        return true;
      }

      // ── Sélection de cible (UserSelectMenu) ──
      if (interaction.isUserSelectMenu() && customId.startsWith("shop_target.")) {
        const itemId = customId.split(".")[1];
        const item = getItem(itemId);
        const targetId = interaction.values[0];

        if (!item) {
          return sendError(interaction, "Article introuvable."), true;
        }

        // Validations de la cible
        const targetUser = await interaction.client.users
          .fetch(targetId)
          .catch(() => null);

        if (!targetUser) {
          return sendError(interaction, "Utilisateur introuvable."), true;
        }

        if (targetUser.bot) {
          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("❌ Cible invalide")
                .setDescription("Vous ne pouvez pas cibler un bot !")
                .setColor(COLORS.ERROR)
                .setTimestamp(),
            ],
            components: [],
          });
          return true;
        }

        if (targetId === interaction.user.id) {
          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("❌ Cible invalide")
                .setDescription("Vous ne pouvez pas vous cibler vous-même !")
                .setColor(COLORS.ERROR)
                .setTimestamp(),
            ],
            components: [],
          });
          return true;
        }

        // Si c'est un item "nickname", ouvrir un modal pour le surnom
        if (item.type === "nickname") {
          const modal = new ModalBuilder()
            .setCustomId(`shop_nick.${itemId}.${targetId}`)
            .setTitle("📝 Surnom Forcé");

          const nicknameInput = new TextInputBuilder()
            .setCustomId("nickname_input")
            .setLabel("Nouveau surnom pour la victime")
            .setPlaceholder("Ex: BouletDuServeur, FanDeJustinBieber...")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(32)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder().addComponents(nicknameInput),
          );

          await interaction.showModal(modal);
          return true;
        }

        // Sinon, achat direct avec cible
        await processPurchase(interaction, item, db, targetId);
        return true;
      }

      // ── Modal surnom ──
      if (interaction.isModalSubmit() && customId.startsWith("shop_nick.")) {
        const parts = customId.split(".");
        const itemId = parts[1];
        const targetId = parts[2];
        const item = getItem(itemId);

        if (!item) {
          return sendError(interaction, "Article introuvable."), true;
        }

        const nickname = interaction.fields.getTextInputValue("nickname_input");

        await processPurchase(interaction, item, db, targetId, nickname);
        return true;
      }

      // ── Bouton Retour (vers liste articles) ──
      if (interaction.isButton() && customId.startsWith("shop_back.")) {
        const categoryId = customId.split(".")[1];
        const { embed, components } = buildCategoryItemsEmbed(categoryId);

        await interaction.update({
          embeds: [embed],
          components,
        });
        return true;
      }

      // ── Bouton Annuler ──
      if (interaction.isButton() && customId === "shop_cancel") {
        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("❌ Achat annulé")
              .setDescription(
                "L'achat a été annulé. Aucun coin n'a été déduit.\n\n" +
                  "💡 *Vous pouvez relancer la boutique depuis le message principal.*",
              )
              .setColor(COLORS.ERROR)
              .setTimestamp(),
          ],
          components: [],
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error("Erreur interaction shop:", error);

      try {
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Erreur")
          .setDescription(
            "Une erreur est survenue. Veuillez réessayer.\n" +
              `\`${error.message}\``,
          )
          .setColor(COLORS.ERROR)
          .setTimestamp();

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errorEmbed], flags: 64 });
        } else {
          await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
      } catch (e) {
        console.error("Erreur lors du traitement de l'erreur shop:", e);
      }

      return true;
    }
  },

  /**
   * Initialise le système de vérification des effets expirés.
   */
  async init(client, db) {
    const checkExpiredEffects = async () => {
      const now = Date.now();

      try {
        const expiredEffects = await db.getExpiredShopEffects(now);

        for (const effect of expiredEffects) {
          try {
            // Traiter selon le type d'effet
            if (effect.effect_type === "nickname") {
              // Restaurer l'ancien surnom
              const guild = client.guilds.cache.first();
              if (guild) {
                const member = await guild.members
                  .fetch(effect.user_id)
                  .catch(() => null);

                if (member) {
                  const originalNickname = effect.extra_data; // Ancien surnom stocké
                  // Si l'ancien surnom était le displayName (pas de nickname custom), on met null
                  await member
                    .setNickname(originalNickname === member.user.displayName ? null : originalNickname)
                    .catch((err) => {
                      console.error(
                        `Erreur restauration surnom pour ${effect.user_id}:`,
                        err,
                      );
                    });
                  console.log(
                    `[Shop] Surnom restauré pour ${member.user.tag} → "${originalNickname || "défaut"}"`,
                  );
                }
              }
            }

            // Désactiver l'effet
            await db.deactivateShopEffect(effect.id);
            console.log(
              `[Shop] Effet expiré désactivé: ${effect.effect_type} pour user ${effect.user_id}`,
            );
          } catch (err) {
            console.error(
              `Erreur traitement effet expiré ${effect.id}:`,
              err,
            );
          }
        }
      } catch (err) {
        console.error("Erreur vérification effets shop expirés:", err);
      }
    };

    // Vérifier au démarrage
    checkExpiredEffects();

    // Vérifier toutes les 60 secondes
    setInterval(checkExpiredEffects, 60 * 1000);

    console.log("[Shop] Système de boutique initialisé");
  },
};
