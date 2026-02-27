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
const { createEmbed, COLORS, formatCoins, sendLog } = require("../utils");
const { ROLE_POOL } = require("../roleConfig");
const shopData = require("../shop.json");

// ─── Constants for Dynamic Pricing ─────────────────────────
const MIN_STEAL_PCT = 0.10;
const MAX_STEAL_PCT = 0.30;
const MARGIN_PCT = 0.05;

function getAdaptiveRefundPrice(roleId) {
  const roleConfig = ROLE_POOL.find((r) => r.id === roleId);
  if (!roleConfig) return 350;

  const p = roleConfig.probability;
  if (p >= 0.15) return 350;        // Commun
  if (p >= 0.07) return 800;        // Peu Commun
  if (p >= 0.03) return 2000;       // Rare
  if (p >= 0.01) return 3500;       // Très Rare
  if (p >= 0.005) return 6000;      // Epique
  if (p >= 0.001) return 10000;     // Mythique
  return 30000;                     // Légendaire
}

// ─── Helpers ────────────────────────────────────────────────

function getItem(itemId) {
  return shopData.items.find((i) => i.id === itemId);
}

function calculateImmunityPrice(userBalance, basePrice) {
  const averageSteal = (MIN_STEAL_PCT + MAX_STEAL_PCT) / 2;
  const highProbSteal = averageSteal * 1.2;
  const price = Number(userBalance) * (highProbSteal + MARGIN_PCT);
  const finalPrice = Math.max(Math.floor(price), Number(basePrice));
  return BigInt(finalPrice);
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

// IDs des rôles Staff à protéger contre les effets agressifs
const STAFF_ROLE_IDS = [
  "1469071689848721510", // Admin/Staff 1
  "1469071689831940310", // Admin/Staff 2
  "1471465293233803274", // Modo
];

// Types d'items considérés comme agressifs/troll
const AGGRESSIVE_ITEM_TYPES = [
  "soumission",
  "timeout",
  "nickname",
  "instant_steal",
];

// ─── Build embeds & components (design sobre) ───────────────

function buildMainShopEmbed() {
  let categoriesDescription = "";
  for (const cat of shopData.categories) {
    const itemCount = shopData.items.filter(
      (i) => i.category === cat.id,
    ).length;
    categoriesDescription +=
      `**${cat.label}** ・ ${itemCount} articles\n` +
      `${cat.description}\n\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle("BOUTIQUE")
    .setDescription(
      `Bienvenue dans la boutique du casino.\n` +
        `Depensez vos coins pour obtenir des pouvoirs, boosts et objets exclusifs.\n\n` +
        categoriesDescription +
        `Selectionnez une categorie ci-dessous.`,
    )
    .setColor(COLORS.PRIMARY)
    .setFooter({
      text: "Les achats sont definitifs ・ Verifiez votre solde avec ;bal",
    })
    .setTimestamp();

  const categoryOptions = shopData.categories.map((cat) => ({
    label: cat.label,
    value: cat.id,
    description: cat.description,
    emoji: cat.emoji,
  }));

  const categorySelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("shop_category")
      .setPlaceholder("Choisir une categorie...")
      .addOptions(categoryOptions),
  );

  return { embed, components: [categorySelect] };
}

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

  const itemOptions = items.map((item) => {
    let displayPrice = item.price;
    const isImmunity = IMMUNITY_ROLE_IDS.includes(item.roleId);
    
    return {
      label: item.label,
      value: item.id,
      description: `${displayPrice} coins${isImmunity ? ' (min)' : ''}${item.duration ? ` ・ ${formatDuration(item.duration)}` : ""}`,
      emoji: item.emoji,
    };
  });

  const itemSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("shop_items")
      .setPlaceholder("Choisir un article...")
      .addOptions(itemOptions),
  );

  return { embed, components: [itemSelect] };
  return { embed, components: [itemSelect] };
}

async function buildReventeItemsEmbed(interaction) {
  const category = getCategory("revente");
  const member = interaction.member;

  // Filter eligible items user owns
  const sellableItems = [];
  
  // Eligible categories: prestige, commandes_lana
  const eligibleCategories = ["prestige", "commandes_lana"];
  const allItems = shopData.items.filter(i => eligibleCategories.includes(i.category));

  for (const item of allItems) {
      if (item.type === "permanent_role" && item.roleId) {
          if (member.roles.cache.has(item.roleId)) {
              sellableItems.push(item);
          }
      } else if (item.type === "role_select" && item.roles) {
          // Check if user has ANY of the roles in the list
          const hasOne = item.roles.some(r => member.roles.cache.has(r.id));
          if (hasOne) {
              sellableItems.push(item);
          }
      }
  }

  if (sellableItems.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(category.label)
        .setDescription(`${category.description}\n\n**Vous n'avez aucun objet eligible a la revente.**\nSeuls les roles permanents et les roles couleurs (Prestige) sont revendables.`)
        .setColor(category.color)
        .setTimestamp();
      return { embed, components: [] };
  }

  let itemsList = "";
  for (const item of sellableItems) {
    const refundPrice = Math.floor(item.price * 0.5);
    itemsList +=
      `**${item.label}**\n` +
      `Valeur de revente : ${formatCoins(refundPrice)}\n\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle(category.label)
    .setDescription(
      `${category.description}\n\n` + itemsList + `Selectionnez un objet a revendre.`,
    )
    .setColor(category.color)
    .setTimestamp();

  const itemOptions = sellableItems.map((item) => ({
    label: item.label,
    value: `sell_${item.id}`, // Special ID prefix for selling
    description: `Revente : ${Math.floor(item.price * 0.5)} coins`,
    emoji: item.emoji,
  }));

  const itemSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("shop_sell_items")
      .setPlaceholder("Choisir un objet a revendre...")
      .addOptions(itemOptions),
  );

  const sellAllRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("shop_sell_all_confirm_prompt")
      .setLabel("Tout Revendre")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("shop_home")
      .setLabel("Menu Principal")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embed, components: [itemSelect, sellAllRow] };
}


function buildItemDetailEmbed(itemId, userBalance = null) {
  const item = getItem(itemId);
  const category = getCategory(item.category);

  let finalPrice = BigInt(item.price);
  let priceNote = "";

  if (userBalance !== null && IMMUNITY_ROLE_IDS.includes(item.roleId)) {
    finalPrice = calculateImmunityPrice(userBalance, item.price);
    if (finalPrice > BigInt(item.price)) {
      priceNote = " (Indexé sur votre patrimoine)";
    } else {
      priceNote = " (Prix minimum)";
    }
  }

  const fields = [
    { name: "Prix", value: `${formatCoins(finalPrice)}${priceNote}`, inline: true },
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

async function processPurchase(interaction, item, db, targetId = null, extraData = null, priceOverride = null) {
  const userId = interaction.user.id;
  let newBalance;

  // Defer immédiatement pour éviter le timeout 3s de Discord
  if (interaction.isModalSubmit()) {
    await interaction.deferReply({ flags: 64 });
  } else {
    // Si déjà déféré ou répondu, on ne fait rien (ex: update fait avant)
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }
  }

  const finalPrice = BigInt(priceOverride !== null ? priceOverride : item.price);

  // Limite quotidienne pour les tirages (max 2 par jour)
  if (item.id === "tirage_1") {
    try {
      const dailyCount = await db.getDailyShopPurchaseCount(userId, item.id);
      if (dailyCount >= 2) {
        return sendError(
          interaction,
          "🚫 **Limite atteinte !**\n\nVous ne pouvez acheter que **2 tirages** par jour dans la boutique."
        );
      }
    } catch (err) {
      console.error("[Shop] Erreur check daily limit:", err);
    }
  }

  try {
    const userData = await db.getUser(userId);
    const balance = BigInt(userData.balance);

    if (balance < finalPrice) {
       return sendError(interaction, `Vous avez besoin de ${formatCoins(finalPrice)} mais vous n'avez que ${formatCoins(userData.balance)}.`);
    }

    // Déduire les coins
    newBalance = await db.updateBalance(userId, -finalPrice, 'Shop: Achat');

    // Enregistrer l'achat (on log le prix réel payé)
    await db.addShopPurchase(userId, item.id, targetId, Number(finalPrice));

  } catch (error) {
      console.error("Erreur processPurchase Transaction:", error);
      return sendError(interaction, "Erreur lors de la transaction.");
  }

  // 🛡️ PROTECTION STAFF/NOUVEAU VENU : Empêcher les actions agressives
  if (targetId && AGGRESSIVE_ITEM_TYPES.includes(item.type)) {
    try {
      const guild = interaction.guild;
      const targetMember = await guild.members.fetch(targetId).catch(() => null);

      if (targetMember) {
        // 1. Check Staff
        const isStaff = STAFF_ROLE_IDS.some((roleId) =>
          targetMember.roles.cache.has(roleId)
        );

        if (isStaff) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement (Staff)');
          return sendError(
            interaction,
            `🛡️ **Action impossible !**\n\n` +
            `Vous ne pouvez pas utiliser cet objet sur un membre du Staff (<@${targetId}>).\n` +
            `Vous avez ete rembourse de **${formatCoins(finalPrice)}**.`
          );
        }

        // 2. 🛡️ BOUCLIER NOUVEAU VENU (48h)
        const TWO_DAYS = 48 * 60 * 60 * 1000;
        const joinedAt = targetMember.joinedTimestamp;
        
        if (Date.now() - joinedAt < TWO_DAYS) {
             newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement (Nouveau Venu)');
             return sendError(
                interaction,
                `❌ **Cible protégée !**\n\n` +
                `Le bouclier "Nouveau Venu" protège <@${targetId}> car il est sur le serveur depuis moins de 48 heures.\n` +
                `Attendez qu'il ait plus d'ancienneté pour interagir via le shop.\n\n` +
                `Vous avez été remboursé de **${formatCoins(finalPrice)}**.`
             );
        }
      }
    } catch (err) {
      console.error("[Shop] Erreur verification staff/newcomer:", err);
    }
  }

  // Appliquer l'effet selon le type
  let effectDescription = "";

  try {
    switch (item.type) {
      case "temp_role": {
        const guild = interaction.guild;
        const roleTargetId = item.needsTarget ? targetId : userId;
        const member = await guild.members.fetch(roleTargetId).catch(() => null);

        if (!member) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, "Le membre cible est introuvable. Vous avez ete rembourse.");
        }

        if (member.roles.cache.has(item.roleId)) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          const msg = item.needsTarget
            ? `<@${roleTargetId}> possede deja ce role. Vous avez ete rembourse.`
            : "Vous possedez deja ce role. Vous avez ete rembourse.";
          return sendError(interaction, msg);
        }

        await member.roles.add(item.roleId).catch(async (err) => {
          console.error("Erreur ajout role shop:", err);
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          throw new Error("Impossible d'ajouter le role. Verifiez les permissions du bot.");
        });

        const expiresAt = Date.now() + item.duration;
        await db.addRoleExpiration(roleTargetId, item.roleId, expiresAt, guild.id);

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
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, "Le membre cible est introuvable. Vous avez ete rembourse.");
        }

        if (member.roles.cache.has(item.roleId)) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, `<@${targetId}> est deja soumis. Vous avez ete rembourse.`);
        }

        // Sauvegarder uniquement les rôles que le bot peut gérer (editable)
        // role.editable renvoie false pour : @everyone, rôles managés, et rôles > bot
        const savedRoleIds = member.roles.cache
          .filter((role) => role.id !== interaction.guild.id && role.editable)
          .map((role) => role.id);

        // Retirer les rôles sauvegardés
        let removedCount = 0;
        for (const roleId of savedRoleIds) {
          await member.roles.remove(roleId).catch((err) => {
            console.error(`[Shop] Erreur retrait role ${roleId} pour soumission:`, err.message);
          });
          removedCount++;
        }

        // Ajouter le rôle soumis
        await member.roles.add(item.roleId).catch(async (err) => {
          console.error("Erreur ajout role soumis shop:", err);
          // Tenter de restaurer les rôles en cas d'échec
          for (const roleId of savedRoleIds) {
            await member.roles.add(roleId).catch(() => {});
          }
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
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
            newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
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
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
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

        await db.updateBalance(targetId, -finalSteal, 'Shop: Vol d\'item (Victime)');
        newBalance = await db.updateBalance(userId, finalSteal, 'Shop: Vol d\'item (Voleur)');

        effectDescription = `Vous avez vole ${formatCoins(finalSteal)} a <@${targetId}>.`;
        break;
      }

      case "timeout": {
        const guild = interaction.guild;
        const member = await guild.members.fetch(targetId).catch(() => null);

        if (!member) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, "Le membre cible est introuvable. Vous avez ete rembourse.");
        }

        if (!member.moderatable) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, "Impossible de mute ce membre. Vous avez ete rembourse.");
        }

        if (member.isCommunicationDisabled()) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, `<@${targetId}> est deja mute. Vous avez ete rembourse.`);
        }

        const reason = `Boutique — Achete par ${interaction.user.username} (${formatDuration(item.duration)})`;

        await member.timeout(item.duration, reason).catch(async (err) => {
          console.error("Erreur timeout shop:", err);
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
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
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, "Le membre cible est introuvable. Vous avez ete rembourse.");
        }

        const oldNickname = member.nickname || member.user.displayName;
        const newNickname = extraData || "Le Soumis du Casino";

        await member.setNickname(newNickname).catch(async (err) => {
          console.error("Erreur changement surnom shop:", err);
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
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
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, "Impossible de vous trouver. Vous avez ete rembourse.");
        }

        if (prMember.roles.cache.has(item.roleId)) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, "Vous possedez deja ce role. Vous avez ete rembourse.");
        }

        await prMember.roles.add(item.roleId).catch(async (err) => {
          console.error("Erreur ajout role permanent shop:", err);
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          throw new Error("Impossible d'ajouter le role. Verifiez les permissions du bot.");
        });

        effectDescription = `Vous avez obtenu le role <@&${item.roleId}> de maniere **permanente**.`;
        break;
      }

      case "role_select": {
        const selectedRoleId = extraData;

        if (!selectedRoleId) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, "Aucun role selectionne. Vous avez ete rembourse.");
        }

        const rsMember = await interaction.guild.members
          .fetch(userId)
          .catch(() => null);

        if (!rsMember) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, "Impossible de vous trouver. Vous avez ete rembourse.");
        }

        if (rsMember.roles.cache.has(selectedRoleId)) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          return sendError(interaction, "Vous possedez deja ce role. Vous avez ete rembourse.");
        }

        await rsMember.roles.add(selectedRoleId).catch(async (err) => {
          console.error("Erreur ajout role select shop:", err);
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
          throw new Error("Impossible d'ajouter le role. Verifiez les permissions du bot.");
        });

        const expiresAtRS = Date.now() + item.duration;
        await db.addRoleExpiration(userId, selectedRoleId, expiresAtRS, interaction.guild.id);

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
        const tirageResult = await db.updateTirages(userId, 1);
        effectDescription = `Vous avez recu **1 tirage** supplementaire. Vous en avez maintenant **${tirageResult}**.`;
        break;
      }

      case "shop_effect": {
        const hasEffect = await db.hasActiveShopEffect(userId, item.value);
        if (hasEffect) {
          newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
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
        newBalance = await db.updateBalance(userId, finalPrice, 'Shop: Remboursement');
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

  // Log de l'achat
  await sendLog(
    interaction.guild,
    "Achat Effectue",
    `**Joueur :** <@${userId}> (${userId})\n` +
      `**Article :** ${item.label}\n` +
      `**Prix :** ${formatCoins(finalPrice)}\n` +
      `**Details :** ${effectDescription}`,
    COLORS.PRIMARY,
  );

  // Embed de succès
  const successEmbed = new EmbedBuilder()
    .setTitle("Achat effectue")
    .setDescription(
      `**${item.label}** ・ ${formatCoins(finalPrice)}\n\n` +
        `${effectDescription}\n\n` +
        `Nouveau solde : ${formatCoins(newBalance)}`,
    )
    .setColor(COLORS.SUCCESS)
    .setTimestamp();

  const category = getCategory(item.category);
  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_back.${item.category}`)
      .setLabel(`Continuer dans ${category?.label || "la categorie"}`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("shop_home")
      .setLabel("Menu Principal")
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.editReply({ embeds: [successEmbed], components: [backRow] });
}

function sendError(interaction, message) {
  const errorEmbed = new EmbedBuilder()
    .setTitle("Erreur")
    .setDescription(message)
    .setColor(COLORS.ERROR)
    .setTimestamp();

  // Si l'interaction est déjà deferred ou replied, utiliser editReply
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({ embeds: [errorEmbed], components: [] });
  }
  // Sinon, répondre normalement
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
        
        if (categoryId === "revente") {
            const { embed, components } = await buildReventeItemsEmbed(interaction); // Async now
            await interaction.reply({
              embeds: [embed],
              components,
              flags: 64,
            });
            return true;
        }

        const { embed, components } = buildCategoryItemsEmbed(categoryId);

        await interaction.reply({
          embeds: [embed],
          components,
          flags: 64,
        });
        return true;
      }

      // ── Sélection d'article à revendre ──
      if (interaction.isStringSelectMenu() && customId === "shop_sell_items") {
          const value = interaction.values[0];
          const itemId = value.replace("sell_", "");
          const item = getItem(itemId);
          
          // ── Gestion spéciale pour ROLE_SELECT (Choix de la couleur à vendre) ──
          if (item.type === "role_select" && item.roles) {
              const member = interaction.member;
              const ownedRoles = item.roles.filter(r => member.roles.cache.has(r.id));
              
              if (ownedRoles.length === 0) {
                  return sendError(interaction, "Vous ne possédez aucun rôle de cet objet."), true;
              }

              // Si le joueur a plusieurs rôles (ou même un seul, pour être explicite), on lui demande lequel vendre.
              
              const roleOptions = ownedRoles.map(r => ({
                  label: r.label,
                  value: `sellrole_${itemId}_${r.id}`,
                  description: `Vendre la variante ${r.label}`,
                  emoji: item.emoji // Ou un emoji spécifique si dispo
              }));

              const embed = new EmbedBuilder()
                  .setTitle(`Revente : ${item.label}`)
                  .setDescription(`Quelle variante souhaitez-vous vendre ?`)
                  .setColor(COLORS.GOLD)
                  .setTimestamp();
              
              const row = new ActionRowBuilder().addComponents(
                  new StringSelectMenuBuilder()
                     .setCustomId("shop_sell_role_select")
                     .setPlaceholder("Choisir la couleur à vendre...")
                     .addOptions(roleOptions)
              );

              await interaction.update({
                  embeds: [embed],
                  components: [row]
              });
              return true;
          }

          // ── Cas Standard (Permanent Role ou autre sans choix) ──
          // Prix par dÃ©faut: 50%
          const refundPrice = Math.floor(item.price * 0.5);

          const embed = new EmbedBuilder()
            .setTitle(`Revente : ${item.label}`)
            .setDescription(
                `Etes-vous sur de vouloir revendre cet objet ?\n\n` +
                `**Prix d'achat :** ${formatCoins(item.price)}\n` +
                `**Prix de revente :** ${formatCoins(refundPrice)} (50%)\n\n` +
                `⚠️ L'objet sera retire de votre inventaire et le role supprime.`
            )
            .setColor(COLORS.GOLD)
            .setTimestamp();

          const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`shop_confirm_sell.${itemId}`)
              .setLabel("Confirmer la Vente")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`shop_back.revente`)
              .setLabel("Retour")
              .setStyle(ButtonStyle.Secondary),
          );

          await interaction.update({
            embeds: [embed],
            components: [buttons],
          });
          return true;
      }

      // ── Sélection de variante à vendre (shop_sell_role_select) ──
      if (interaction.isStringSelectMenu() && customId === "shop_sell_role_select") {
          const value = interaction.values[0]; 
          // Format: sellrole_itemId_roleId
          const parts = value.split("_");
          // parts[0] is 'sellrole'
          // The LAST part is always the roleId (snowflake)
          
          const roleId = parts.pop(); // Removes last part (roleId)
          parts.shift(); // Removes first part ('sellrole')
          const itemId = parts.join("_"); // Reconstruct itemId

          const item = getItem(itemId);
          if (!item) return sendError(interaction, "Objet introuvable (ID invalide)."), true;
          
          // Trouver le label du rôle spécifique
          const roleOption = item.roles.find(r => r.id === roleId);
          const roleLabel = roleOption ? roleOption.label : "Inconnu";

          // ── BLOCK BOOSTS ──
          if (roleLabel.includes("Boost") || roleLabel.includes("XP")) {
              return sendError(interaction, "Les Boosts d'XP ne peuvent pas être revendus."), true;
          }

          // ── CALCUL DU PRIX ADAPTATIF ──
          const refundPrice = getAdaptiveRefundPrice(roleId);

          const embed = new EmbedBuilder()
            .setTitle(`Revente : ${roleLabel}`)
            .setDescription(
                `Etes-vous sur de vouloir revendre **${roleLabel}** ?\n\n` +
                `**Prix de revente :** ${formatCoins(refundPrice)}\n\n` +
                `⚠️ Le rôle **${roleLabel}** sera retiré.`
            )
            .setColor(COLORS.GOLD)
            .setTimestamp();
          
          const buttons = new ActionRowBuilder().addComponents(
             new ButtonBuilder()
              .setCustomId(`shop_confirm_sell.${itemId}.${roleId}.${refundPrice}`)
              .setLabel("Confirmer la Vente")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`shop_back.revente`)
              .setLabel("Annuler")
              .setStyle(ButtonStyle.Secondary),
          );

          await interaction.update({
            embeds: [embed],
            components: [buttons]
          });
          return true;
      }

      // ── Confirmation de Vente ──
      if (interaction.isButton() && customId.startsWith("shop_confirm_sell.")) {
          const parts = customId.split(".");
          const itemId = parts[1];
          const specificRoleId = parts[2]; // Optional: Specific role ID to sell
          const passedPrice = parts[3] ? parseInt(parts[3]) : null;

          const item = getItem(itemId);
          const userId = interaction.user.id;
          const member = interaction.member;

          if (!item) return sendError(interaction, "Objet introuvable."), true;

          // Default 50%
          let refundPrice = Math.floor(item.price * 0.5);
          
          // Override if specific Role & passed price (or recalc logic)
          if (passedPrice) {
               refundPrice = passedPrice;
          } else if (specificRoleId) {
              refundPrice = getAdaptiveRefundPrice(specificRoleId);
          }

          let roleRemoved = false;
          let roleLabel = item.label;

          try {
              // 1. Cas : Rôle Spécifique (Role Select via menu)
              if (specificRoleId) {
                  if (member.roles.cache.has(specificRoleId)) {
                      await member.roles.remove(specificRoleId);
                      roleRemoved = true;
                      
                      // Try to find label for better UX
                      if (item.roles) {
                          const r = item.roles.find(x => x.id === specificRoleId);
                          if (r) roleLabel += ` (${r.label})`;
                      }
                  }
              } 
              // 2. Cas : Rôle Permanent (pas de choix)
              else if (item.type === "permanent_role") {
                  if (member.roles.cache.has(item.roleId)) {
                      await member.roles.remove(item.roleId);
                      roleRemoved = true;
                  }
              } 
              // 3. Cas : Role Select sans choix spécifique (fallback ou bug)
              // On essaye de trouver un rôle que le joueur possède
              else if (item.type === "role_select") {
                  const ownedRole = item.roles.find(r => member.roles.cache.has(r.id));
                  if (ownedRole) {
                      await member.roles.remove(ownedRole.id);
                      roleRemoved = true;
                      roleLabel += ` (${ownedRole.label})`;
                  }
              }

              if (!roleRemoved) {
                  return sendError(interaction, "Vous ne possedez pas cet objet (ou le role a deja ete retire)."), true;
              }

              await db.updateBalance(userId, refundPrice, 'Shop: Revente');

              await sendLog(
                interaction.guild,
                "Revente Boutique",
                `**Joueur :** <@${userId}>\n**Objet :** ${roleLabel}\n**Gain :** ${formatCoins(refundPrice)}\n**Rareté :** ${specificRoleId ? "Aléatoire (Prix Adaptatif)" : "Fixe"}`,
                COLORS.GOLD
              );

              const successEmbed = new EmbedBuilder()
                .setTitle("Vente reussie")
                .setDescription(
                    `Vous avez vendu **${roleLabel}** pour **${formatCoins(refundPrice)}**.\n` +
                    `Le role a ete retire de votre profil.`
                )
                .setColor(COLORS.SUCCESS)
                .setTimestamp();

              const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("shop_back.revente")
                  .setLabel("Continuer la revente")
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId("shop_home")
                  .setLabel("Menu Principal")
                  .setStyle(ButtonStyle.Secondary)
              );

              await interaction.update({
                  embeds: [successEmbed],
                  components: [backRow]
              });

          } catch (err) {
              console.error("Erreur vente shop:", err);
              return sendError(interaction, "Une erreur est survenue lors de la vente."), true;
          }
          return true;
      }

      // ── Sélection d'article ──
      if (interaction.isStringSelectMenu() && customId === "shop_items") {
        const itemId = interaction.values[0];

        // ── SPECIAL BUY : Rôle Couleur Basic ──
        // On intercepte pour forcer le choix AVANT l'achat et afficher le VRAI prix
        if (itemId === "role_couleur_basic") {
             const item = getItem(itemId);
             // On construit un embed de choix de couleur
             const roleOptions = item.roles.map((role) => ({
                label: role.label,
                value: role.id,
                emoji: role.emoji,
             }));

             const roleSelectEmbed = new EmbedBuilder()
                .setTitle(`Choix de la couleur ・ ${item.label}`)
                .setDescription(
                  `Veuillez choisir la couleur que vous souhaitez acheter.\n` +
                  `⚠️ **Le prix varie selon la rareté de la couleur !**\n\n` +
                  `**Prix de base :** Variable (voir après sélection)`
                )
                .setColor(COLORS.GOLD)
                .setTimestamp();

             const roleSelect = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`shop_buy_specific_role_select.${itemId}`) // New customID
                  .setPlaceholder("Choisir une couleur...")
                  .addOptions(roleOptions),
             );
             
             // Back button
             const backRow = new ActionRowBuilder().addComponents(
                 new ButtonBuilder()
                   .setCustomId(`shop_back.${item.category}`)
                   .setLabel("Retour")
                   .setStyle(ButtonStyle.Secondary)
             );

             await interaction.update({
                embeds: [roleSelectEmbed],
                components: [roleSelect, backRow],
             });
             return true;
        }

        const userData = await db.getUser(interaction.user.id);
        const { embed, components } = buildItemDetailEmbed(itemId, userData.balance);

        await interaction.update({
          embeds: [embed],
          components,
        });
        return true;
      }
      
      // ── Sélection de la couleur spécifique pour ACHAT (Dynamic Price) ──
      if (interaction.isStringSelectMenu() && customId.startsWith("shop_buy_specific_role_select.")) {
          const itemId = customId.split(".")[1];
          const selectedRoleId = interaction.values[0];
          const item = getItem(itemId);
          
          if (!item) return sendError(interaction, "Objet introuvable."), true;
          
          // Trouver le label
          const roleOption = item.roles.find(r => r.id === selectedRoleId);
          const roleLabel = roleOption ? roleOption.label : "Inconnu";

          // Calcul du prix d'achat dynamique (2x prix de vente)
          const roleConfig = ROLE_POOL.find(r => r.id === selectedRoleId);
          let buyPrice = 1500; // Fallback
          
          if (roleConfig) {
             buyPrice = getAdaptiveRefundPrice(selectedRoleId) * 2;
          }

          const embed = new EmbedBuilder()
            .setTitle(`Achat : ${roleLabel}`)
            .setDescription(
                `Vous avez choisi la variante **${roleLabel}**.\n\n` +
                `**Prix :** ${formatCoins(buyPrice)}\n` +
                `**Duree :** ${formatDuration(item.duration)}\n\n` +
                `Voulez-vous confirmer cet achat ?`
            )
            .setColor(COLORS.GOLD)
            .setTimestamp();
            
          const buttons = new ActionRowBuilder().addComponents(
             new ButtonBuilder()
               .setCustomId(`shop_confirm_buy_dynamic.${itemId}.${selectedRoleId}.${buyPrice}`)
               .setLabel(`Acheter pour ${buyPrice} coins`)
               .setStyle(ButtonStyle.Success),
             new ButtonBuilder()
               .setCustomId(`shop_back.${item.category}`) // Retour categorie
               .setLabel("Annuler")
               .setStyle(ButtonStyle.Secondary)
          );
          
          await interaction.update({ embeds: [embed], components: [buttons] });
          return true;
      }
      
      // ── Confirmation Achat Dynamique ──
      if (interaction.isButton() && customId.startsWith("shop_confirm_buy_dynamic.")) {
          const parts = customId.split(".");
          const itemId = parts[1];
          const roleId = parts[2];
          const price = parseInt(parts[3]);
          
          const item = getItem(itemId);
          if (!item) return sendError(interaction, "Objet introuvable."), true;
          
          // Call generic processPurchase but override price and roleId
          // We need to modify processPurchase to accept price override
          // Or we duplicate the logic for safety. 
          // Let's call processPurchase with extra params.
          
          await processPurchase(interaction, item, db, null, roleId, price);
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
          const userData = await db.getUser(interaction.user.id);
          let finalPrice = BigInt(item.price);
          if (IMMUNITY_ROLE_IDS.includes(item.roleId)) {
            finalPrice = calculateImmunityPrice(userData.balance, item.price);
          }

          const targetEmbed = new EmbedBuilder()
            .setTitle(`Choisir une cible ・ ${item.label}`)
            .setDescription(
              `Selectionnez le joueur sur qui appliquer l'effet.\n\n` +
                `Prix : ${formatCoins(finalPrice)}` +
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

          const userData = await db.getUser(interaction.user.id);
          let finalPrice = BigInt(item.price);
          if (IMMUNITY_ROLE_IDS.includes(item.roleId)) {
            finalPrice = calculateImmunityPrice(userData.balance, item.price);
          }

          const roleSelectEmbed = new EmbedBuilder()
            .setTitle(`Choisissez votre couleur ・ ${item.label}`)
            .setDescription(
              `Selectionnez le role couleur que vous souhaitez.\n\n` +
                `Prix : ${formatCoins(finalPrice)}\n` +
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
        const userData = await db.getUser(interaction.user.id);
        let finalPriceOverride = null;
        if (IMMUNITY_ROLE_IDS.includes(item.roleId)) {
          finalPriceOverride = calculateImmunityPrice(userData.balance, item.price);
        }
        await processPurchase(interaction, item, db, null, null, finalPriceOverride);
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

        const userData = await db.getUser(interaction.user.id);
        let finalPriceOverride = null;
        if (IMMUNITY_ROLE_IDS.includes(item.roleId)) {
          finalPriceOverride = calculateImmunityPrice(userData.balance, item.price);
        }
        await processPurchase(interaction, item, db, null, selectedRoleId, finalPriceOverride);
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
        
        // ── SPECIAL : VOL DYNAMIQUE (instant_steal) ──
        if (item.type === "instant_steal") {
            const targetData = await db.getUser(targetId);
            const targetBalance = Number(targetData.balance);
            
            // Calcul du prix dynamique
            // Gain Potentiel = Solde_Cible * 0.20
            // Prix_Vente = Gain_Potentiel * 0.60
            // Min 400
            const potentialGain = targetBalance * 0.20;
            let dynamicPrice = Math.floor(potentialGain * 0.60);
            if (dynamicPrice < 400) dynamicPrice = 400;

            const confirmEmbed = new EmbedBuilder()
                .setTitle(`⚠️ Confirmation de Vol`)
                .setDescription(
                    `Le prix du vol varie selon la richesse de la victime.\n\n` +
                    `💰 **Cible :** <@${targetId}>\n` +
                    `🏦 **Solde estimé :** ${formatCoins(targetBalance)}\n` +
                    `💸 **Coût du vol :** ${formatCoins(dynamicPrice)}\n\n` +
                    `*Le prix sera recalculé au moment exact de la validation.*`
                )
                .setColor(COLORS.VIOLET)
                .setTimestamp();

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`shop_force_steal.${itemId}.${targetId}`)
                    .setLabel(`Payer ${formatCoins(dynamicPrice)} et Voler`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId("shop_cancel")
                    .setLabel("Annuler")
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.update({
                embeds: [confirmEmbed],
                components: [buttons]
            });
            return true;
        }

        const userData = await db.getUser(interaction.user.id);
        let finalPriceOverride = null;
        if (IMMUNITY_ROLE_IDS.includes(item.roleId)) {
          finalPriceOverride = calculateImmunityPrice(userData.balance, item.price);
        }
        await processPurchase(interaction, item, db, targetId, null, finalPriceOverride);
        return true;
      }

      // ── Confirmation Vol Dynamique ──
      if (interaction.isButton() && customId.startsWith("shop_force_steal.")) {
          const parts = customId.split(".");
          const itemId = parts[1];
          const targetId = parts[2];
          const item = getItem(itemId);

          if (!item) return sendError(interaction, "Article introuvable."), true;

          // Re-calcul du prix en temps réel
          const targetData = await db.getUser(targetId);
          const targetBalance = Number(targetData.balance);
          
          const potentialGain = targetBalance * 0.20;
          let dynamicPrice = Math.floor(potentialGain * 0.60);
          if (dynamicPrice < 400) dynamicPrice = 400;

          // Créer un faux item avec le nouveau prix
          const dynamicItem = { ...item, price: dynamicPrice };

          await processPurchase(interaction, dynamicItem, db, targetId);
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
        
        // Specifique REVENTE : On veut afficher la liste des objets a vendre (comme shop_sell_items)
        // et non la liste d'achat de la categorie revente (qui est vide ou textuelle)
        if (categoryId === "revente") {
           // On re-simule le code de shop_sell_items car c'est un menu dynamique
           // basÃ© sur l'inventaire et non static
           // On doit appeler la logique de construction de menu de revente
           // Mais ici on est dans un bouton, pas un select menu "shop_category"
           // On doit dupliquer ou extraire la logique.
           // Pour faire simple, on copie la logique de detection inventaire.
           
           const member = interaction.member;
           const eligibleItems = shopData.items.filter(i => 
             (i.category === "prestige" || i.category === "commandes_lana") && 
             (i.price > 0)
           );
           
           // Filter owned
           const ownedItems = [];
           for (const item of eligibleItems) {
               if (item.type === "role_select" && item.roles) {
                   if (item.roles.some(r => member.roles.cache.has(r.id))) {
                       ownedItems.push(item);
                   }
               } else if (item.roleId && member.roles.cache.has(item.roleId)) {
                   ownedItems.push(item);
               }
           }

           if (ownedItems.length === 0) {
              const embed = new EmbedBuilder()
                .setTitle("Revente")
                .setDescription("Vous ne possedez aucun objet eligible a la revente.")
                .setColor(COLORS.GOLD);
              // Retour menu principal
              const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder()
                    .setCustomId("shop_cancel") // Act as cancel/home
                    .setLabel("Retour Boutique")
                    .setStyle(ButtonStyle.Secondary)
              );
              await interaction.update({ embeds: [embed], components: [row] });
              return true;
           }

           const options = ownedItems.map(item => ({
               label: item.label,
               value: `sell_${item.id}`,
               description: `Prix d'achat: ${item.price} coins`,
               emoji: item.emoji
           })).slice(0, 25); 

           const embed = new EmbedBuilder()
             .setTitle("Revente d'objets")
             .setDescription("Selectionnez un objet a revendre (50% ou Prix Adaptatif).")
             .setColor(COLORS.GOLD);

           const row = new ActionRowBuilder().addComponents(
             new StringSelectMenuBuilder()
               .setCustomId("shop_sell_items")
               .setPlaceholder("Choisir un objet a vendre...")
               .addOptions(options)
           );
            
           await interaction.update({ embeds: [embed], components: [row] });
           return true;
        }

        // Default behavior for BUY categories
        const { embed, components } = buildCategoryItemsEmbed(categoryId);

        await interaction.update({
          embeds: [embed],
          components,
        });
        return true;
      }

      // ── Bouton Fermer (Clear) ──
      if (interaction.isButton() && customId === "shop_cancel") {
        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("Boutique")
              .setDescription(
                "Interaction terminee.\n\n" +
                  "Vous pouvez relancer la boutique depuis le message principal.",
              )
              .setColor(COLORS.ERROR)
              .setTimestamp(),
          ],
          components: [],
        });
        return true;
      }

      // ── Bouton Home ──
      if (interaction.isButton() && customId === "shop_home") {
        const { embed, components } = buildMainShopEmbed();
        await interaction.update({
          embeds: [embed],
          components,
        });
        return true;
      }

      // ── Prompt Tout Revendre ──
      if (interaction.isButton() && customId === "shop_sell_all_confirm_prompt") {
        const member = interaction.member;
        const eligibleCategories = ["prestige", "commandes_lana"];
        const allItems = shopData.items.filter((i) =>
          eligibleCategories.includes(i.category)
        );

        const itemsToSell = [];
        let totalGain = 0;

        for (const item of allItems) {
          if (item.type === "permanent_role" && item.roleId) {
            if (member.roles.cache.has(item.roleId)) {
              const price = Math.floor(item.price * 0.5);
              itemsToSell.push({ label: item.label, price, roleId: item.roleId });
              totalGain += price;
            }
          } else if (item.type === "role_select" && item.roles) {
            for (const r of item.roles) {
              if (member.roles.cache.has(r.id)) {
                // Check if Boost
                if (r.label.includes("Boost") || r.label.includes("XP")) continue;

                const price = getAdaptiveRefundPrice(r.id);
                itemsToSell.push({ label: `${item.label} (${r.label})`, price, roleId: r.id });
                totalGain += price;
              }
            }
          }
        }

        if (itemsToSell.length === 0) {
          return sendError(interaction, "Vous n'avez aucun objet a revendre."), true;
        }

        const listContent = itemsToSell
          .map((i) => `・ **${i.label}** : ${formatCoins(i.price)}`)
          .join("\n")
          .slice(0, 3000); // Truncate if too long

        const embed = new EmbedBuilder()
          .setTitle("Tout Revendre")
          .setDescription(
            `Etes-vous sur de vouloir revendre tous vos objets ?\n\n` +
              listContent +
              `\n\n💰 **Gain Total estimé : ${formatCoins(totalGain)}**`
          )
          .setColor(ButtonStyle.Danger)
          .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("shop_sell_all_execute")
            .setLabel("Confirmer la Vente Totale")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("shop_back.revente")
            .setLabel("Annuler")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [buttons] });
        return true;
      }

      // ── Execution Tout Revendre ──
      if (interaction.isButton() && customId === "shop_sell_all_execute") {
        const userId = interaction.user.id;
        const member = interaction.member;
        const eligibleCategories = ["prestige", "commandes_lana"];
        const allItems = shopData.items.filter((i) =>
          eligibleCategories.includes(i.category)
        );

        const rolesToRemove = [];
        let totalGain = 0;

        for (const item of allItems) {
          if (item.type === "permanent_role" && item.roleId) {
            if (member.roles.cache.has(item.roleId)) {
              rolesToRemove.push(item.roleId);
              totalGain += Math.floor(item.price * 0.5);
            }
          } else if (item.type === "role_select" && item.roles) {
            for (const r of item.roles) {
              if (member.roles.cache.has(r.id)) {
                if (r.label.includes("Boost") || r.label.includes("XP")) continue;
                rolesToRemove.push(r.id);
                totalGain += getAdaptiveRefundPrice(r.id);
              }
            }
          }
        }

        if (rolesToRemove.length === 0) {
          return sendError(interaction, "Plus rien a revendre."), true;
        }

        try {
          // Remove roles
          for (const roleId of rolesToRemove) {
            await member.roles.remove(roleId).catch((err) => {
              console.error(`[Shop] Erreur retrait role ${roleId} lors de la vente totale:`, err);
            });
          }

          // Update balance
          const newBalance = await db.updateBalance(userId, BigInt(totalGain), "Shop: Revente Totale");

          await sendLog(
            interaction.guild,
            "Revente Totale Boutique",
            `**Joueur :** <@${userId}>\n**Objets vendus :** ${rolesToRemove.length}\n**Gain Total :** ${formatCoins(totalGain)}`,
            COLORS.GOLD
          );

          const successEmbed = new EmbedBuilder()
            .setTitle("Vente Totale reussie")
            .setDescription(
              `Tous vos objets eligibles ont ete vendus pour un total de **${formatCoins(totalGain)}**.\n` +
                `Votre nouveau solde : ${formatCoins(newBalance)}`
            )
            .setColor(COLORS.SUCCESS)
            .setTimestamp();

          const backRow = new ActionRowBuilder().addComponents(
             new ButtonBuilder()
                .setCustomId("shop_home")
                .setLabel("Menu Principal")
                .setStyle(ButtonStyle.Secondary)
          );

          await interaction.update({ embeds: [successEmbed], components: [backRow] });
        } catch (err) {
          console.error("Erreur vente totale shop:", err);
          return sendError(interaction, "Une erreur est survenue lors de la vente totale."), true;
        }

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
   * Au démarrage : scan complet, traite les expirés, log les actifs restants.
   * Puis vérifie toutes les 15 secondes.
   */
  async init(client, db) {
    // ── Fonction de traitement d'un effet expiré ──
    // Retourne true si l'effet doit être désactivé, false si membre introuvable sur cette guilde
    const processExpiredEffect = async (effect, guild) => {
      // ── Restauration de surnom ──
      if (effect.effect_type === "nickname") {
        const member = await guild.members.fetch({ user: effect.user_id, force: true }).catch(() => null);

        if (!member) return false; // Introuvable sur cette guilde

        const originalNickname = effect.extra_data;
        await member
          .setNickname(
            originalNickname === member.user.displayName ? null : originalNickname,
          )
          .catch((err) => {
            console.error(`[Shop] Erreur restauration surnom pour ${effect.user_id}:`, err.message);
          });
        console.log(
          `[Shop] Surnom restaure pour ${member.user.tag} -> "${originalNickname || "defaut"}"`,
        );

        await sendLog(
          guild,
          "Restauration Surnom",
          `Le surnom de <@${effect.user_id}> a ete restaure a : **${originalNickname || "Défaut"}**.`,
          COLORS.SUCCESS
        );
        return true;
      }

      // ── Restauration soumission ──
      if (effect.effect_type === "soumission") {
        const member = await guild.members.fetch({ user: effect.user_id, force: true }).catch(() => null);

        if (!member) return false; // Introuvable sur cette guilde

        let savedRoleIds = [];
        try {
          savedRoleIds = JSON.parse(effect.extra_data || "[]");
        } catch (e) {
          console.error("[Shop] Erreur parsing roles sauvegardes:", e);
        }

        const soumisRoleId = effect.value;

        // 🔍 VÉRIFICATION DU CONTEXTE GUILD (Fix multi-serveurs)
        // On vérifie si les rôles à restaurer (ou le rôle soumis) existent sur ce serveur.
        // Si aucun rôle n'existe, c'est probablement qu'on est sur le mauvais serveur (ex: dev vs prod)
        // et qu'on a trouvé le membre sur ce mauvais serveur.
        
        await guild.roles.fetch().catch(() => console.warn("[Shop] Echec fetch roles, utilisation cache"));

        const rolesToRestore = [];
        let matchingRolesCount = 0;

        // Vérifier le rôle soumis
        if (soumisRoleId && guild.roles.cache.has(soumisRoleId)) {
            matchingRolesCount++;
        }

        // Vérifier les rôles sauvegardés et préparer la liste
        const failedRoles = [];
        
        for (const roleId of savedRoleIds) {
             const role = guild.roles.cache.get(roleId);
             
             if (role) {
                 matchingRolesCount++;
                 if (role.editable) {
                     rolesToRestore.push(roleId);
                 } else {
                     failedRoles.push(`${role.name} (Hiérarchie)`);
                 }
             } else {
                 failedRoles.push(`ID: ${roleId} (Introuvable)`);
             }
        }

        // Si aucun rôle n'est trouvé (ni le soumis, ni ceux à rendre) alors qu'il y en avait,
        // on considère qu'on est sur le mauvais serveur.
        // On retourne false pour laisser la boucle essayer la guilde suivante.
        if (matchingRolesCount === 0 && (savedRoleIds.length > 0 || soumisRoleId)) {
            // Petite protection : si l'utilisateur n'a vraiment plus aucun rôle nulle part, ça finira en timeout 24h.
            console.log(`[Shop] Membre ${member.user.tag} trouvé sur ${guild.name} mais aucun rôle correspondant n'existe. Skip.`);
            return false; 
        }

        // --- PROCÉDURE DE RESTAURATION ---

        // Retirer le rôle soumis (si présent)
        if (soumisRoleId && guild.roles.cache.has(soumisRoleId)) {
             await member.roles.remove(soumisRoleId).catch((err) => {
              console.error(
                `[Shop] Erreur retrait role soumis (${soumisRoleId}) pour ${effect.user_id}:`,
                err.message,
              );
            });
        }

        let restoredCount = 0;
        
        // Tentative de restauration en masse
        if (rolesToRestore.length > 0) {
            try {
                await member.roles.add(rolesToRestore);
                restoredCount = rolesToRestore.length;
            } catch (err) {
                console.error(`[Shop] Erreur restauration de masse pour ${member.user.tag}, tentative unitaire...`, err.message);
                
                // Fallback: Restauration unitaire
                for (const roleId of rolesToRestore) {
                    try {
                        await member.roles.add(roleId);
                        restoredCount++;
                    } catch (innerErr) {
                         console.error(`[Shop] Erreur unitaire role ${roleId}:`, innerErr.message);
                         failedRoles.push(`${roleId} (Erreur API)`);
                    }
                }
            }
        }

        console.log(
          `[Shop] Soumission expiree pour ${member.user.tag} : ${restoredCount}/${savedRoleIds.length} roles restaures sur ${guild.name}`,
        );

        let logDescription = `La soumission de <@${effect.user_id}> est terminee.\n**Roles restaures :** ${restoredCount}/${savedRoleIds.length}`;
        if (failedRoles.length > 0) {
          const failedStr = failedRoles.join(", ");
          logDescription += `\n**Echecs :** ${failedStr.length > 500 ? failedStr.slice(0, 500) + "..." : failedStr}`;
          
          if (failedRoles.some(f => f.includes("Hiérarchie"))) {
              logDescription += `\n⚠️ **ATTENTION :** Certains rôles n'ont pas pu être rendus car ils sont au-dessus du rôle du bot !`;
          }
        }

        await sendLog(
          guild,
          "Soumission Terminee",
          logDescription,
          restoredCount === savedRoleIds.length ? COLORS.SUCCESS : COLORS.GOLD
        );

        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle("Soumission terminee")
            .setDescription(
              `Votre soumission est terminee.\nVos roles ont ete restaures (${restoredCount}/${savedRoleIds.length}).`
            )
            .setColor(COLORS.SUCCESS)
            .setTimestamp();
          await member.send({ embeds: [dmEmbed] }).catch(() => {});
        } catch (e) {}

        return true;
      }

      // Autres types d'effets : toujours désactiver
      return true;
    };

    // ── Check régulier des effets expirés ──
    let isProcessing = false;

    const checkExpiredEffects = async () => {
      if (isProcessing) return;
      isProcessing = true;
      
      const now = Date.now();

      try {
        const expiredEffects = await db.getExpiredShopEffects(now);

        for (const effect of expiredEffects) {
          let processed = false;

          // Essayer sur toutes les guildes du bot
          for (const guild of client.guilds.cache.values()) {
            // Restriction au serveur principal
            if (guild.id !== "1469071689399926786") continue;

            try {
              const result = await processExpiredEffect(effect, guild);
              if (result === true) {
                processed = true;
                break; // Traité avec succès sur cette guilde
              }
            } catch (err) {
              console.error(`[Shop] Erreur traitement effet ${effect.id} sur guilde ${guild.id}:`, err);
            }
          }

          if (processed) {
            await db.deactivateShopEffect(effect.id);
            console.log(`[Shop] Effet ${effect.id} desactive avec succes.`);
          } else {
            // Membre introuvable sur le serveur principal
            // On vérifie si cela fait plus de 1h (réduit de 24h pour éviter le spam inutile)
            const effectAge = Date.now() - Number(effect.expires_at);
            // 1h = 60 * 60 * 1000
            if (effectAge > 60 * 60 * 1000) {
              console.log(`[Shop] Membre ${effect.user_id} introuvable sur le serveur > 1h. Nettoyage.`);
              await db.deactivateShopEffect(effect.id);
              
              const logGuild = client.guilds.cache.get("1469071689399926786");
              if (logGuild) {
                await sendLog(
                  logGuild,
                  "Nettoyage Effet Expire",
                  `Membre <@${effect.user_id}> (${effect.user_id}) introuvable sur le serveur.\nL'effet **${effect.effect_type}** a ete force-supprime de la base de donnees.`,
                  COLORS.GOLD
                );
              }
            }
            // Sinon, on laisse actif et on réessaiera au prochain cycle (boucle normale)
          }
        }
      } catch (err) {
        console.error("[Shop] Erreur verification effets expires:", err);
      } finally {
        isProcessing = false;
      }
    };

    // ── Startup recovery : scan complet ──
    try {
      console.log("[Shop] Demarrage recovery...");

      // 1. Traiter tous les effets qui ont expiré pendant que le bot était éteint
      await checkExpiredEffects();

      // 2. Lister tous les effets encore actifs (pour le log)
      const allActive = await db.getAllActiveShopEffectsList();
      const activeWithExpiry = allActive.filter((e) => e.expires_at);
      const activeNoExpiry = allActive.filter((e) => !e.expires_at);

      if (activeWithExpiry.length > 0) {
        console.log(`[Shop] ${activeWithExpiry.length} effet(s) a duree encore actif(s) :`);
        for (const effect of activeWithExpiry) {
          const remaining = Math.max(0, Number(effect.expires_at) - Date.now());
          const remainingStr = formatDuration(remaining);
          console.log(
            `  - ${effect.effect_type} pour user ${effect.user_id} (expire dans ${remainingStr})`,
          );
        }
      }

      if (activeNoExpiry.length > 0) {
        console.log(`[Shop] ${activeNoExpiry.length} effet(s) permanent(s) actif(s)`);
      }

      if (allActive.length === 0) {
        console.log("[Shop] Aucun effet actif a restaurer");
      }
    } catch (err) {
      console.error("[Shop] Erreur lors du startup recovery:", err);
    }

    // ── Interval régulier ──
    setInterval(checkExpiredEffects, 15 * 1000);

    console.log("[Shop] Systeme initialise ・ check toutes les 15s ・ persistence DB active");
  },
};
