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
    temp_role: "Role temporaire",
    timeout: "Mute",
    nickname: "Changement de surnom",
    permanent_role: "Role permanent",
    role_select: "Role au choix",
    xp_boost: "Boost d'XP",
    ticket: "Ticket",
    tirage: "Tirage",
    shop_effect: "Effet special",
    soumission: "Soumission",
    instant_steal: "Vol immediat",
  };
  return labels[type] || type;
}

// IDs des rôles d'immunité vol
const IMMUNITY_ROLE_IDS = [
  "1470934040692392008", // 2H
  "1470934642998644826", // 6H
  "1470934696085946561", // 24H
];

// ─── Build embeds & components (design sobre) ───────────────

function buildCategoryItemsEmbed(categoryId) {
  const category = getCategory(categoryId);
  const items = getItemsByCategory(categoryId);

  let itemsList = "";
  for (const item of items) {
    const durationStr = item.duration ? ` ・ ${formatDuration(item.duration)}` : "";
    const targetStr = item.needsTarget ? " ・ Cible requise" : "";
    itemsList +=
      `**${item.label}**\n` +
      `${formatCoins(item.price)}${durationStr}${targetStr}\n\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(category.label)
    .setDescription(
      `${category.description}\n\n` + itemsList + `Selectionnez un article pour voir les details.`,
    )
    .setColor(category.color)
    .setTimestamp();

  const itemOptions = items.map((item) => ({
    label: item.label,
    value: item.id,
    description: `${item.price} coins${item.duration ? ` ・ ${formatDuration(item.duration)}` : ""}`,
    emoji: item.emoji,
  }));

  const itemSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("shop_items")
      .setPlaceholder("Choisir un article...")
      .addOptions(itemOptions),
  );

  return { embed, components: [itemSelect] };
}

function buildItemDetailEmbed(itemId) {
  const item = getItem(itemId);
  const category = getCategory(item.category);

  const fields = [
    { name: "Prix", value: formatCoins(item.price), inline: true },
  ];

  if (item.duration) {
    fields.push({
      name: "Duree",
      value: formatDuration(item.duration),
      inline: true,
    });
  }

  fields.push({ name: "Type", value: getTypeLabel(item.type), inline: true });

  if (item.needsTarget) {
    fields.push({
      name: "Cible",
      value: "Un joueur de votre choix",
      inline: true,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(item.label)
    .setDescription(item.description)
    .setColor(category.color)
    .addFields(fields)
    .setFooter({ text: `Categorie : ${category.label}` })
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_confirm.${itemId}`)
      .setLabel("Confirmer l'achat")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`shop_back.${item.category}`)
      .setLabel("Retour")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("shop_cancel")
      .setLabel("Annuler")
      .setStyle(ButtonStyle.Danger),
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
      .setTitle("Solde insuffisant")
      .setDescription(
        `Vous avez besoin de ${formatCoins(item.price)} mais vous n'avez que ${formatCoins(userData.balance)}.`,
      )
      .setColor(COLORS.ERROR)
      .setTimestamp();

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
        const roleTargetId = item.needsTarget ? targetId : userId;
        const member = await guild.members.fetch(roleTargetId).catch(() => null);

        if (!member) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Le membre cible est introuvable. Vous avez ete rembourse.");
        }

        if (member.roles.cache.has(item.roleId)) {
          await db.updateBalance(userId, item.price);
          const msg = item.needsTarget
            ? `<@${roleTargetId}> possede deja ce role. Vous avez ete rembourse.`
            : "Vous possedez deja ce role. Vous avez ete rembourse.";
          return sendError(interaction, msg);
        }

        await member.roles.add(item.roleId).catch(async (err) => {
          console.error("Erreur ajout role shop:", err);
          await db.updateBalance(userId, item.price);
          throw new Error("Impossible d'ajouter le role. Verifiez les permissions du bot.");
        });

        const expiresAt = Date.now() + item.duration;
        await db.addRoleExpiration(roleTargetId, item.roleId, expiresAt);

        if (item.needsTarget) {
          effectDescription = `<@${roleTargetId}> a recu le role <@&${item.roleId}> pour **${formatDuration(item.duration)}**.`;
        } else {
          effectDescription = `Vous avez obtenu le role <@&${item.roleId}> pour **${formatDuration(item.duration)}**.`;
        }
        break;
      }

      case "soumission": {
        const guild = interaction.guild;
        const member = await guild.members.fetch(targetId).catch(() => null);

        if (!member) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Le membre cible est introuvable. Vous avez ete rembourse.");
        }

        if (member.roles.cache.has(item.roleId)) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, `<@${targetId}> est deja soumis. Vous avez ete rembourse.`);
        }

        // Sauvegarder tous les rôles actuels (exclure @everyone et les rôles managés)
        const savedRoleIds = member.roles.cache
          .filter((role) => role.id !== guild.id && !role.managed)
          .map((role) => role.id);

        // Retirer tous les rôles
        for (const roleId of savedRoleIds) {
          await member.roles.remove(roleId).catch((err) => {
            console.error(`[Shop] Erreur retrait role ${roleId} pour soumission:`, err.message);
          });
        }

        // Ajouter le rôle soumis
        await member.roles.add(item.roleId).catch(async (err) => {
          console.error("Erreur ajout role soumis shop:", err);
          // Tenter de restaurer les rôles en cas d'échec
          for (const roleId of savedRoleIds) {
            await member.roles.add(roleId).catch(() => {});
          }
          await db.updateBalance(userId, item.price);
          throw new Error("Impossible d'ajouter le role soumis. Roles restaures, rembourse.");
        });

        // Sauvegarder dans shop_effects pour restauration automatique
        const expiresAt = Date.now() + item.duration;
        await db.addShopEffect(
          targetId,
          userId,
          "soumission",
          item.roleId,
          JSON.stringify(savedRoleIds),
          expiresAt,
        );

        // Envoyer un MP a la victime
        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle("Vous avez ete soumis")
            .setDescription(
              `Un joueur a utilise la boutique pour vous soumettre.\n\n` +
                `Duree : **${formatDuration(item.duration)}**\n` +
                `Vos roles seront restaures automatiquement a la fin du delai.`,
            )
            .setColor(COLORS.ERROR)
            .setTimestamp();
          await member.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch (e) {}

        effectDescription = `<@${targetId}> a ete soumis pour **${formatDuration(item.duration)}**.\nTous ses roles ont ete retires et seront restaures automatiquement.`;
        break;
      }

      case "instant_steal": {
        const guild = interaction.guild;

        // Vérifier l'immunité de la cible
        const targetMember = await guild.members.fetch(targetId).catch(() => null);
        if (targetMember) {
          const activeImmunity = IMMUNITY_ROLE_IDS.find((roleId) =>
            targetMember.roles.cache.has(roleId),
          );
          if (activeImmunity) {
            await db.updateBalance(userId, item.price);
            return sendError(
              interaction,
              `<@${targetId}> possede une immunite contre les vols. Vous avez ete rembourse.`,
            );
          }
        }

        // Vérifier le solde de la cible
        const targetData = await db.getUser(targetId);
        const targetBalance = BigInt(targetData.balance);

        if (targetBalance < 50n) {
          await db.updateBalance(userId, item.price);
          return sendError(
            interaction,
            `<@${targetId}> est trop pauvre pour etre vole. Vous avez ete rembourse.`,
          );
        }

        // Calculer le montant volé (10-30% du solde cible)
        const targetBalanceNum = Number(targetBalance);
        const stealAmount = BigInt(
          Math.floor(targetBalanceNum * (Math.random() * 0.2 + 0.1)),
        );
        const finalSteal = stealAmount < 50n ? 50n : stealAmount;

        // Transférer les coins
        await db.updateBalance(targetId, -finalSteal);
        await db.updateBalance(userId, finalSteal);

        effectDescription = `Vous avez vole ${formatCoins(finalSteal)} a <@${targetId}>.`;
        break;
      }

      case "timeout": {
        const guild = interaction.guild;
        const member = await guild.members.fetch(targetId).catch(() => null);

        if (!member) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Le membre cible est introuvable. Vous avez ete rembourse.");
        }

        if (!member.moderatable) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Impossible de mute ce membre. Vous avez ete rembourse.");
        }

        if (member.isCommunicationDisabled()) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, `<@${targetId}> est deja mute. Vous avez ete rembourse.`);
        }

        const reason = `Boutique — Achete par ${interaction.user.username} (${formatDuration(item.duration)})`;

        await member.timeout(item.duration, reason).catch(async (err) => {
          console.error("Erreur timeout shop:", err);
          await db.updateBalance(userId, item.price);
          throw new Error("Impossible de mute ce membre. Verifiez les permissions du bot.");
        });

        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle("Vous avez ete rendu muet")
            .setDescription(
              `Un joueur a utilise la boutique pour vous rendre muet.\n\n` +
                `Duree : **${formatDuration(item.duration)}**\n` +
                `Raison : Achat en boutique par **${interaction.user.username}**\n\n` +
                `Vous retrouverez la parole automatiquement a la fin du delai.`,
            )
            .setColor(COLORS.ERROR)
            .setTimestamp();
          await member.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch (e) {}

        effectDescription = `<@${targetId}> a ete rendu muet pour **${formatDuration(item.duration)}**.`;
        break;
      }

      case "nickname": {
        const guild = interaction.guild;
        const member = await guild.members.fetch(targetId).catch(() => null);

        if (!member) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Le membre cible est introuvable. Vous avez ete rembourse.");
        }

        const oldNickname = member.nickname || member.user.displayName;
        const newNickname = extraData || "Le Soumis du Casino";

        await member.setNickname(newNickname).catch(async (err) => {
          console.error("Erreur changement surnom shop:", err);
          await db.updateBalance(userId, item.price);
          throw new Error("Impossible de changer le surnom. Verifiez les permissions du bot.");
        });

        const expiresAt = Date.now() + item.duration;
        await db.addShopEffect(targetId, userId, "nickname", newNickname, oldNickname, expiresAt);

        effectDescription = `Le surnom de <@${targetId}> a ete change en **"${newNickname}"** pour **${formatDuration(item.duration)}**.`;
        break;
      }

      case "permanent_role": {
        const prMember = await interaction.guild.members
          .fetch(userId)
          .catch(() => null);

        if (!prMember) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Impossible de vous trouver. Vous avez ete rembourse.");
        }

        if (prMember.roles.cache.has(item.roleId)) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Vous possedez deja ce role. Vous avez ete rembourse.");
        }

        await prMember.roles.add(item.roleId).catch(async (err) => {
          console.error("Erreur ajout role permanent shop:", err);
          await db.updateBalance(userId, item.price);
          throw new Error("Impossible d'ajouter le role. Verifiez les permissions du bot.");
        });

        effectDescription = `Vous avez obtenu le role <@&${item.roleId}> de maniere **permanente**.`;
        break;
      }

      case "role_select": {
        const selectedRoleId = extraData;

        if (!selectedRoleId) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Aucun role selectionne. Vous avez ete rembourse.");
        }

        const rsMember = await interaction.guild.members
          .fetch(userId)
          .catch(() => null);

        if (!rsMember) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Impossible de vous trouver. Vous avez ete rembourse.");
        }

        if (rsMember.roles.cache.has(selectedRoleId)) {
          await db.updateBalance(userId, item.price);
          return sendError(interaction, "Vous possedez deja ce role. Vous avez ete rembourse.");
        }

        await rsMember.roles.add(selectedRoleId).catch(async (err) => {
          console.error("Erreur ajout role select shop:", err);
          await db.updateBalance(userId, item.price);
          throw new Error("Impossible d'ajouter le role. Verifiez les permissions du bot.");
        });

        const expiresAtRS = Date.now() + item.duration;
        await db.addRoleExpiration(userId, selectedRoleId, expiresAtRS);

        const selectedRoleLabel =
          item.roles?.find((r) => r.id === selectedRoleId)?.label || "Inconnu";
        effectDescription = `Vous avez obtenu le role couleur **${selectedRoleLabel}** (<@&${selectedRoleId}>) pour **${formatDuration(item.duration)}**.`;
        break;
      }

      case "xp_boost": {
        const expiresAt = Date.now() + item.duration;
        await db.addShopEffect(userId, null, "xp_boost", item.value.toString(), null, expiresAt);

        effectDescription = `Boost XP **+${item.value}%** active pour **${formatDuration(item.duration)}**.`;
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
              id: "1469071689848721510",
              allow: ["ViewChannel", "SendMessages"],
            },
          ],
        });

        const ticketEmbed = createEmbed(
          "Demande d'Emoji Personnalise",
          `<@${userId}>, bienvenue dans votre ticket.\n\n` +
            `Decrivez l'emoji que vous souhaitez :\n` +
            `・ Envoyez une image ou un lien vers l'image\n` +
            `・ Precisez le nom souhaite pour l'emoji\n\n` +
            `Un administrateur viendra traiter votre demande.`,
          COLORS.VIOLET,
        );

        await channel.send({
          content: `<@${userId}>`,
          embeds: [ticketEmbed],
        });

        effectDescription = `Ticket cree : ${channel}\nUn admin traitera votre demande d'emoji personnalise.`;
        break;
      }

      case "tirage": {
        const newTirages = await db.updateTirages(userId, 1);
        effectDescription = `Vous avez recu **1 tirage** supplementaire. Vous en avez maintenant **${newTirages}**.`;
        break;
      }

      case "shop_effect": {
        const hasEffect = await db.hasActiveShopEffect(userId, item.value);
        if (hasEffect) {
          await db.updateBalance(userId, item.price);
          return sendError(
            interaction,
            `Vous avez deja l'effet **${item.label}** actif. Vous avez ete rembourse.`,
          );
        }

        const expiresAt = item.duration ? Date.now() + item.duration : null;
        await db.addShopEffect(userId, null, item.value, null, null, expiresAt);

        if (item.duration) {
          effectDescription = `Effet **${item.label}** active pour **${formatDuration(item.duration)}**.`;
        } else {
          effectDescription = `Effet **${item.label}** active ・ usage unique.`;
        }
        break;
      }

      default: {
        await db.updateBalance(userId, item.price);
        return sendError(
          interaction,
          `Type d'article inconnu : ${item.type}. Vous avez ete rembourse.`,
        );
      }
    }
  } catch (error) {
    console.error("Erreur application effet shop:", error);
    return sendError(
      interaction,
      error.message || "Une erreur est survenue lors de l'application de l'effet.",
    );
  }

  // Embed de succès
  const successEmbed = new EmbedBuilder()
    .setTitle("Achat effectue")
    .setDescription(
      `**${item.label}** ・ ${formatCoins(item.price)}\n\n` +
        `${effectDescription}\n\n` +
        `Nouveau solde : ${formatCoins(newBalance)}`,
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
    .setTitle("Erreur")
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
          flags: 64,
        });
        return true;
      }

      // ── Sélection d'article ──
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
            .setTitle(`Choisir une cible ・ ${item.label}`)
            .setDescription(
              `Selectionnez le joueur sur qui appliquer l'effet.\n\n` +
                `Prix : ${formatCoins(item.price)}` +
                (item.duration ? `\nDuree : ${formatDuration(item.duration)}` : ""),
            )
            .setColor(COLORS.GOLD)
            .setTimestamp();

          const targetSelect = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId(`shop_target.${itemId}`)
              .setPlaceholder("Selectionner un joueur...")
              .setMinValues(1)
              .setMaxValues(1),
          );

          const cancelRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("shop_cancel")
              .setLabel("Annuler")
              .setStyle(ButtonStyle.Danger),
          );

          await interaction.update({
            embeds: [targetEmbed],
            components: [targetSelect, cancelRow],
          });
          return true;
        }

        // Si c'est un role_select
        if (item.type === "role_select" && item.roles?.length > 0) {
          const roleOptions = item.roles.map((role) => ({
            label: role.label,
            value: role.id,
            emoji: role.emoji,
          }));

          const roleSelectEmbed = new EmbedBuilder()
            .setTitle(`Choisissez votre couleur ・ ${item.label}`)
            .setDescription(
              `Selectionnez le role couleur que vous souhaitez.\n\n` +
                `Prix : ${formatCoins(item.price)}\n` +
                `Duree : ${formatDuration(item.duration)}\n\n` +
                `Les coins seront deduits apres votre choix.`,
            )
            .setColor(COLORS.GOLD)
            .setTimestamp();

          const roleSelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`shop_roleselect.${itemId}`)
              .setPlaceholder("Choisir une couleur...")
              .addOptions(roleOptions),
          );

          const cancelRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("shop_cancel")
              .setLabel("Annuler")
              .setStyle(ButtonStyle.Danger),
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

      // ── Sélection de rôle couleur ──
      if (interaction.isStringSelectMenu() && customId.startsWith("shop_roleselect.")) {
        const itemId = customId.split(".")[1];
        const item = getItem(itemId);
        const selectedRoleId = interaction.values[0];

        if (!item) {
          return sendError(interaction, "Article introuvable."), true;
        }

        await processPurchase(interaction, item, db, null, selectedRoleId);
        return true;
      }

      // ── Sélection de cible ──
      if (interaction.isUserSelectMenu() && customId.startsWith("shop_target.")) {
        const itemId = customId.split(".")[1];
        const item = getItem(itemId);
        const targetId = interaction.values[0];

        if (!item) {
          return sendError(interaction, "Article introuvable."), true;
        }

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
                .setTitle("Cible invalide")
                .setDescription("Vous ne pouvez pas cibler un bot.")
                .setColor(COLORS.ERROR)
                .setTimestamp(),
            ],
            components: [],
          });
          return true;
        }

        if (targetId === interaction.user.id && item.type !== "instant_steal") {
          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("Cible invalide")
                .setDescription("Vous ne pouvez pas vous cibler vous-meme.")
                .setColor(COLORS.ERROR)
                .setTimestamp(),
            ],
            components: [],
          });
          return true;
        }

        if (targetId === interaction.user.id && item.type === "instant_steal") {
          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("Cible invalide")
                .setDescription("Vous ne pouvez pas vous voler vous-meme.")
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
            .setTitle("Surnom Force");

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

        // Achat direct avec cible
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

      // ── Bouton Retour ──
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
              .setTitle("Achat annule")
              .setDescription(
                "L'achat a ete annule. Aucun coin n'a ete deduit.\n\n" +
                  "Vous pouvez relancer la boutique depuis le message principal.",
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
          .setTitle("Erreur")
          .setDescription(
            "Une erreur est survenue. Veuillez reessayer.\n" +
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
   * Vérifie toutes les 15 secondes pour les effets courts (soumission 2min).
   */
  async init(client, db) {
    const checkExpiredEffects = async () => {
      const now = Date.now();

      try {
        const expiredEffects = await db.getExpiredShopEffects(now);

        for (const effect of expiredEffects) {
          try {
            const guild = client.guilds.cache.first();
            if (!guild) continue;

            // ── Restauration de surnom ──
            if (effect.effect_type === "nickname") {
              const member = await guild.members.fetch(effect.user_id).catch(() => null);

              if (member) {
                const originalNickname = effect.extra_data;
                await member
                  .setNickname(
                    originalNickname === member.user.displayName ? null : originalNickname,
                  )
                  .catch((err) => {
                    console.error(`Erreur restauration surnom pour ${effect.user_id}:`, err);
                  });
                console.log(
                  `[Shop] Surnom restaure pour ${member.user.tag} -> "${originalNickname || "defaut"}"`,
                );
              }
            }

            // ── Restauration soumission (re-ajouter les rôles) ──
            if (effect.effect_type === "soumission") {
              const member = await guild.members.fetch(effect.user_id).catch(() => null);

              if (member) {
                // Retirer le rôle soumis
                const soumisRoleId = effect.value;
                await member.roles.remove(soumisRoleId).catch((err) => {
                  console.error(
                    `[Shop] Erreur retrait role soumis pour ${effect.user_id}:`,
                    err.message,
                  );
                });

                // Restaurer les rôles sauvegardés
                let savedRoleIds = [];
                try {
                  savedRoleIds = JSON.parse(effect.extra_data || "[]");
                } catch (e) {
                  console.error("[Shop] Erreur parsing roles sauvegardes:", e);
                }

                let restoredCount = 0;
                for (const roleId of savedRoleIds) {
                  try {
                    const role = guild.roles.cache.get(roleId);
                    if (role && !role.managed) {
                      await member.roles.add(roleId);
                      restoredCount++;
                    }
                  } catch (err) {
                    console.error(
                      `[Shop] Erreur restauration role ${roleId} pour ${effect.user_id}:`,
                      err.message,
                    );
                  }
                }

                console.log(
                  `[Shop] Soumission expiree pour ${member.user.tag} : ${restoredCount}/${savedRoleIds.length} roles restaures`,
                );

                // Envoyer un MP
                try {
                  const dmEmbed = new EmbedBuilder()
                    .setTitle("Soumission terminee")
                    .setDescription(
                      `Votre soumission est terminee.\nVos roles ont ete restaures (${restoredCount}/${savedRoleIds.length}).`,
                    )
                    .setColor(COLORS.SUCCESS)
                    .setTimestamp();
                  await member.send({ embeds: [dmEmbed] }).catch(() => {});
                } catch (e) {}
              } else {
                console.log(
                  `[Shop] Membre ${effect.user_id} introuvable pour restauration soumission`,
                );
              }
            }

            // Désactiver l'effet
            await db.deactivateShopEffect(effect.id);
            console.log(
              `[Shop] Effet expire desactive: ${effect.effect_type} pour user ${effect.user_id}`,
            );
          } catch (err) {
            console.error(`Erreur traitement effet expire ${effect.id}:`, err);
          }
        }
      } catch (err) {
        console.error("Erreur verification effets shop expires:", err);
      }
    };

    // Vérifier au démarrage
    checkExpiredEffects();

    // Vérifier toutes les 15 secondes (pour les soumissions de 2min)
    setInterval(checkExpiredEffects, 15 * 1000);

    console.log("[Shop] Systeme de boutique initialise (check toutes les 15s)");
  },
};
