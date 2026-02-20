const { createEmbed, COLORS, formatCoins, sendLog } = require("../utils");
const { drawRole, ROLE_POOL, WINS_CHANNEL_ID } = require("../roleConfig");

module.exports = {
  name: "tirage",
  description: "Effectue un tirage pour obtenir un rôle de couleur ou des coins",
  async execute(message, args, db) {
    const user = await db.getUser(message.author.id);
    let count = 1;
    
    // Handle multi-draw arguments
    if (args[0]) {
        const arg = args[0].toLowerCase();
        if (arg === 'x3') count = 3;
        else if (arg === 'x5') count = 5;
        else if (arg === 'x10') count = 10;
        else if (!isNaN(arg)) count = Math.min(Math.max(parseInt(arg), 1), 10);
    }

    if (user.tirages < count) {
      return message.reply({
        embeds: [
          createEmbed(
            "Erreur",
            `Vous n'avez pas assez de tirages disponibles ! 🎫\n\nIl vous faut **${count}** tirages pour faire un ${args[0] || 'tirage'}.\nUtilisez \`;profil\` pour voir vos tirages restants.`,
            COLORS.ERROR,
          ),
        ],
      });
    }

    // Perform the draws
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push(drawRole());
    }

    // Remove tirages
    await db.updateTirages(message.author.id, -count);

    // Process results
    const summary = {
        roles: [],
        coins: 0n,
        extraTirages: 0
    };

    const winsChannel = await message.client.channels.fetch(WINS_CHANNEL_ID).catch(() => null);

    for (const wonReward of results) {
        const probability = (wonReward.probability * 100).toFixed(3);
        
        let rarityEmoji = "🔸";
        let rarityText = "Commun";
        if (wonReward.probability < 0.005) {
            rarityEmoji = "💎";
            rarityText = "ULTRA RARE";
        } else if (wonReward.probability < 0.02) {
            rarityEmoji = "⭐";
            rarityText = "RARE";
        } else if (wonReward.probability < 0.06) {
            rarityEmoji = "🔹";
            rarityText = "MOYEN RARE";
        }

        if (wonReward.type === 'coins') {
            let amount = BigInt(wonReward.amount);
            
            // Appliquer Bonus de Prestige (Bonus casino s'applique aussi aux coins gagnés par chance)
            const { applyPrestigeBonus } = require('../prestigeConfig');
            amount = applyPrestigeBonus(amount, parseInt(user.prestige || 0));

            summary.coins += amount;
            await db.updateBalance(message.author.id, amount);
            
            if (winsChannel && wonReward.probability < 0.06) {
                const winEmbed = createEmbed(
                    `${rarityEmoji} TIRAGE : COINS GAGNÉS !`,
                    `**${message.author.username}** a gagné **${formatCoins(amount)}** dans un tirage !\n\n` +
                    `**Rareté:** ${rarityText}\n` +
                    `**Probabilité:** ${probability}%`,
                    wonReward.color,
                );
                winEmbed.setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
                await winsChannel.send({ embeds: [winEmbed] }).catch(() => {});
            }
        } 
        else if (wonReward.type === 'extra_tirages') {
            summary.extraTirages += wonReward.amount;
            await db.updateTirages(message.author.id, wonReward.amount);
            
            if (winsChannel && wonReward.probability < 0.06) {
                const winEmbed = createEmbed(
                    `${rarityEmoji} TIRAGE : BONUS !`,
                    `**${message.author.username}** a gagné **+${wonReward.amount} tirages** !\n\n` +
                    `**Rareté:** ${rarityText}\n` +
                    `**Probabilité:** ${probability}%`,
                    wonReward.color,
                );
                winEmbed.setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
                await winsChannel.send({ embeds: [winEmbed] }).catch(() => {});
            }
        }
        else if (wonReward.type === 'role') {
            try {
                const member = await message.guild.members.fetch(message.author.id);
                const role = message.guild.roles.cache.get(wonReward.id);

                if (role && !member.roles.cache.has(wonReward.id)) {
                    await member.roles.add(role);
                    summary.roles.push(wonReward);

                    if (wonReward.duration) {
                        const expiresAt = Date.now() + wonReward.duration;
                        await db.addRoleExpiration(message.author.id, wonReward.id, expiresAt, message.guild.id);
                        
                        const durationText = (wonReward.duration / (60*60*1000)).toFixed(1) + 'h';
                        await sendLog(
                            message.guild,
                            '🎁 Role Temporaire Gagné (Tirage)',
                            `<@${message.author.id}> a gagné le rôle <@&${wonReward.id}> via un tirage.\n\n**Durée :** ${durationText}`,
                            COLORS.SUCCESS
                        );
                    }

                    if (winsChannel && wonReward.probability < 0.06) {
                        const winEmbed = createEmbed(
                            `${rarityEmoji} NOUVEAU RÔLE OBTENU !`,
                            `**${message.author.username}** a obtenu le rôle <@&${wonReward.id}> !\n\n` +
                            `**Rareté:** ${rarityText}\n` +
                            `**Probabilité:** ${probability}%`,
                            wonReward.color,
                        );
                        winEmbed.setThumbnail(message.author.displayAvatarURL({ dynamic: true }));
                        await winsChannel.send({ embeds: [winEmbed] }).catch(() => {});
                    }
                } else if (role) {
                    summary.roles.push({ ...wonReward, alreadyOwned: true });
                }
            } catch (e) {
                console.error("Error during role assignment in multi-tirage:", e);
            }
        }
    }

    // Build final result message
    let resultText = "";
    const items = [];

    if (summary.coins > 0n) {
        items.push(`🪙 **Coins :** +${formatCoins(summary.coins)}`);
    }
    if (summary.extraTirages > 0) {
        items.push(`🎫 **Tirages bonus :** +${summary.extraTirages}`);
    }

    resultText = items.join("\n") + (items.length > 0 ? "\n\n" : "");

    if (summary.roles.length > 0) {
        resultText += `**Rôles obtenus :**\n`;
        summary.roles.forEach(r => {
            const prob = (r.probability * 100).toFixed(r.probability < 0.001 ? 3 : 2);
            resultText += `• <@&${r.id}> \`(${prob}%)\` ${r.alreadyOwned ? "*(déjà possédé)*" : ""}\n`;
        });
    }

    if (count > 1 && (summary.coins > 0n || summary.extraTirages > 0)) {
        resultText += `\n*Détails des gains probabilités :*\n`;
        results.forEach((res, index) => {
            if (res.type !== 'role') {
                const prob = (res.probability * 100).toFixed(res.probability < 0.001 ? 3 : 2);
                resultText += `> Tirage ${index + 1}: **${res.name}** \`(${prob}%)\`\n`;
            }
        });
    }

    if (!resultText) resultText = "Vous n'avez rien gagné de neuf cette fois-ci ! Better luck next time ! 🍀";

    const finalUser = await db.getUser(message.author.id);
    const resultEmbed = createEmbed(
        count > 1 ? `🎰 Résultats des ${count} Tirages` : `🎰 Résultat du Tirage`,
        `${resultText}\n\n**Total Tirages Restants :** \`${finalUser.tirages}\` 🎫`,
        results.length === 1 ? results[0].color : COLORS.PRIMARY
    );

    return message.reply({ embeds: [resultEmbed] });
  },
};
