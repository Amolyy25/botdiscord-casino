const { 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType 
} = require('discord.js');
const { createEmbed, COLORS, formatCoins, sendLog } = require('../utils');

const MOD_ROLE_ID = "1474736793063657482";
const ALLOWED_CHANNEL_ID = "1469258215916175392";
const HOURLY_QUOTA = 10;
const quotaMap = new Map(); // moderatorId => [timestamps]

// Configuration des Sanctions
const CATEGORIES = {
    cheat: { label: 'Triche / Cheat', description: 'Utilisation de logiciels tiers ou exploitation de bugs' },
    macro: { label: 'Macro / Autoclick', description: 'Automatisation des commandes ou clics' },
    aide: { label: 'Aide à la triche', description: 'Complicité ou partage de méthodes de triche' },
    abus: { label: 'Abus de système', description: 'Abus des mécaniques du casino' },
    antifarm: { label: 'Anti-farm / Bypass', description: 'Tentative de contournement des protections' }
};

const SEVERITIES = {
    low: {
        label: '🔴 Faible',
        penaltyPercent: 2,
        penaltyMin: 1000n,
        muteTime: 10 * 60 * 1000, // 10 minutes
        resetStats: false,
        desc: 'Avertissement + Amende légère + 10min Mute'
    },
    medium: {
        label: '🟠 Moyenne',
        penaltyPercent: 10,
        penaltyMin: 50000n,
        muteTime: 2 * 3600 * 1000, // 2 heures
        resetStats: false,
        desc: 'Amende modérée + 2h Mute'
    },
    high: {
        label: '⚫ Haute',
        penaltyPercent: 30,
        penaltyMin: 500000n,
        muteTime: 24 * 3600 * 1000, // 24 heures
        resetStats: true,
        desc: 'Amende forte + 24h Mute + RESET DES STATS'
    }
};

module.exports = {
    name: 'sanction',
    description: 'Menu interactif de sanction (Mod/Admin)',
    async execute(message, args, db) {
        // --- Vérification Permissions ---
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
        const hasModRole = message.member.roles.cache.has(MOD_ROLE_ID);

        if (!isAdmin && !hasModRole) {
            return message.reply({
                embeds: [createEmbed('Erreur', `Vous n'avez pas la permission d'utiliser cette commande.`, COLORS.ERROR)]
            });
        }

        // --- Vérification Salon ---
        if (!isAdmin && message.channel.id !== ALLOWED_CHANNEL_ID) {
            return message.reply({
                embeds: [createEmbed('Erreur', `Cette commande peut uniquement être utilisée dans le salon <#${ALLOWED_CHANNEL_ID}>.`, COLORS.ERROR)]
            });
        }

        // --- Vérification Quota ---
        if (!isAdmin && hasModRole) {
            const now = Date.now();
            const hourAgo = now - 3600000;
            let uses = quotaMap.get(message.author.id) || [];

            // Nettoyage des vieux timestamps
            uses = uses.filter(t => t > hourAgo);

            if (uses.length >= HOURLY_QUOTA) {
                return message.reply({
                    embeds: [createEmbed('Quota Atteint', `Vous avez atteint votre quota de ${HOURLY_QUOTA} sanctions par heure.`, COLORS.ERROR)]
                });
            }
        }

        // --- Récupération de la cible ---
        let targetUser = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;

        if (!targetUser && rawId) {
            try {
                targetUser = await message.client.users.fetch(rawId);
            } catch (e) {}
        }

        if (!targetUser) {
            return message.reply({
                embeds: [createEmbed('Usage', `Format: \`;sanction @user/ID\``, COLORS.ERROR)]
            });
        }

        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return message.reply({ embeds: [createEmbed('Erreur', `Utilisateur introuvable sur le serveur.`, COLORS.ERROR)] });
        }

        // --- Workflow Interactif ---
        let selectedCategory = null;
        let selectedSeverity = null;
        let resetStatsConfirmed = false;

        const mainEmbed = createEmbed(
            '⚖️ Tribunal du Casino',
            `Préparation d'une sanction pour **${targetUser.tag}**.\n\n` +
            `**Étape 1 :** Choisissez la catégorie d'infraction.`,
            COLORS.PRIMARY
        );

        const categorySelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('sanction_category')
                .setPlaceholder('Sélectionner une catégorie...')
                .addOptions(Object.entries(CATEGORIES).map(([key, data]) => ({
                    label: data.label,
                    description: data.description,
                    value: key
                })))
        );

        const reply = await message.reply({ embeds: [mainEmbed], components: [categorySelect] });

        // --- Collector ---
        const collector = reply.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.customId === 'sanction_category') {
                selectedCategory = i.values[0];

                const severityEmbed = createEmbed(
                    '⚖️ Tribunal du Casino',
                    `**Cible :** ${targetUser.tag}\n` +
                    `**Catégorie :** ${CATEGORIES[selectedCategory].label}\n\n` +
                    `**Étape 2 :** Choisissez la gravité de la sanction.`,
                    COLORS.PRIMARY
                );

                const severitySelect = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('sanction_severity')
                        .setPlaceholder('Sélectionner la gravité...')
                        .addOptions(Object.entries(SEVERITIES).map(([key, data]) => ({
                            label: data.label,
                            description: data.desc,
                            value: key
                        })))
                );

                await i.update({ embeds: [severityEmbed], components: [severitySelect] });
            }

            else if (i.customId === 'sanction_severity') {
                selectedSeverity = i.values[0];
                const config = SEVERITIES[selectedSeverity];
                resetStatsConfirmed = config.resetStats;

                const confirmEmbed = createEmbed(
                    '⚠️ Confirmation de la Sanction',
                    `**Cible :** ${targetUser.tag}\n` +
                    `**Catégorie :** ${CATEGORIES[selectedCategory].label}\n` +
                    `**Gravité :** ${config.label}\n\n` +
                    `**Pénitences prévues :**\n` +
                    `• Mute (Timeout) : **${formatTime(config.muteTime)}**\n` +
                    `• Amende : **${config.penaltyPercent}%** du solde (min. ${formatCoins(config.penaltyMin)})\n` +
                    (resetStatsConfirmed ? `• **⚠️ RESET TOTAL DES STATS & ACHIEVEMENTS ⚠️**\n` : ''),
                    COLORS.GOLD
                );

                const confirmRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sanction_confirm').setLabel('Appliquer la peine').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('sanction_cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary)
                );

                await i.update({ embeds: [confirmEmbed], components: [confirmRow] });
            }

            else if (i.customId === 'sanction_confirm') {
                collector.stop('executed');

                try {
                    const config = SEVERITIES[selectedSeverity];
                    const user = await db.getUser(targetUser.id);
                    const bal = BigInt(user.balance);

                    // Calcul de l'amende
                    let penalty = (bal * BigInt(config.penaltyPercent)) / 100n;
                    if (penalty < config.penaltyMin) penalty = config.penaltyMin;

                    // 1. Appliquer amende
                    const newBal = await db.updateBalance(targetUser.id, -penalty, `Sanction [${selectedCategory}] - ${selectedSeverity}`);

                    // 2. Appliquer Mute (Timeout)
                    let muteError = false;
                    try {
                        await targetMember.timeout(config.muteTime, `Sanction Casino: ${CATEGORIES[selectedCategory].label}`);
                    } catch (e) {
                        muteError = true;
                    }

                    // 3. Reset Stats si nécessaire
                    if (resetStatsConfirmed) {
                        await db.resetUserStats(targetUser.id);
                    }

                    // 4. Persistence DB
                    await db.addSanction(targetUser.id, message.author.id, selectedCategory, selectedSeverity, penalty, config.muteTime, resetStatsConfirmed);

                    // 5. DM Notification
                    const dmEmbed = createEmbed(
                        '⚖️ Sanction reçue - Casino',
                        `Vous avez été sanctionné par le Tribunal du Casino.\n\n` +
                        `🔹 **Catégorie :** ${CATEGORIES[selectedCategory].label}\n` +
                        `🔹 **Gravité :** ${config.label}\n` +
                        `🔹 **Amende :** ${formatCoins(penalty)}\n` +
                        `🔹 **Mute :** ${formatTime(config.muteTime)}\n` +
                        (resetStatsConfirmed ? `🔹 **Note :** Vos statistiques de jeu ont été réinitialisées.\n` : '') +
                        `\n*Veillez à respecter le règlement pour éviter des sanctions plus lourdes.*`,
                        COLORS.ERROR
                    );
                    await targetUser.send({ embeds: [dmEmbed] }).catch(() => {});

                    // --- Log Final ---
                    const finalEmbed = createEmbed(
                        '⚖️ Verdict Rendu',
                        `Le marteau de la justice a frappé **${targetUser.tag}**.\n\n` +
                        `🔹 **Catégorie :** ${CATEGORIES[selectedCategory].label}\n` +
                        `🔹 **Gravité :** ${config.label}\n` +
                        `🔹 **Amende :** ${formatCoins(penalty)}\n` +
                        (resetStatsConfirmed ? `🔹 **Stats :** Remises à zéro ♻️\n` : '') +
                        `🔹 **Notif :** Envoyée en DM 📩`,
                        COLORS.ERROR
                    );

                    await i.update({ embeds: [finalEmbed], components: [] });

                    // Enregistrer quota
                    if (!isAdmin) {
                        const timestamps = quotaMap.get(message.author.id) || [];
                        timestamps.push(Date.now());
                        quotaMap.set(message.author.id, timestamps);
                    }

                    // Log Admin
                    await sendLog(message.guild, '⚖️ Log Sanction Casino',
                        `**Responsable :** ${message.author.tag} (<@${message.author.id}>)\n` +
                        `**Cible :** ${targetUser.tag} (<@${targetUser.id}>)\n` +
                        `**Motif :** ${CATEGORIES[selectedCategory].label}\n` +
                        `**Gravité :** ${config.label}\n` +
                        `**Amende :** ${formatCoins(penalty)}\n` +
                        `**Reset Stats :** ${resetStatsConfirmed ? 'OUI' : 'NON'}`,
                        COLORS.ERROR
                    );

                } catch (err) {
                    console.error(err);
                    await i.followUp({ content: 'Une erreur est survenue.', ephemeral: true });
                }
            }

            else if (i.customId === 'sanction_cancel') {
                collector.stop('cancelled');
                await i.update({ embeds: [createEmbed('Annulé', 'Procédure annulée.', COLORS.PRIMARY)], components: [] });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                reply.edit({ components: [] }).catch(() => {});
            }
        });
    }
};

function formatTime(ms) {
    if (ms < 3600000) return `${Math.round(ms / 60000)} minutes`;
    return `${Math.round(ms / 3600000)} heures`;
}
