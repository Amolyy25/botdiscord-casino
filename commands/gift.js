const { createEmbed, COLORS, formatCoins, parseAmount } = require('../utils');
const achievementsHelper = require('../helpers/achievementsHelper');
const { PRESTIGE_LEVELS } = require('../prestigeConfig');

const recipientCooldowns = new Map();

module.exports = {
    name: 'gift',
    description: 'Donne des coins à un autre utilisateur',
    async execute(message, args, db) {
        let target = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;
        const amount = parseAmount(args[1]);

        if (!target && rawId) {
            try {
                target = await message.client.users.fetch(rawId);
            } catch (e) {}
        }

        if (!target || amount === null) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;gift @user/ID [montant]\``, COLORS.ERROR)]
            });
        }

        if (target.id === message.author.id) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Vous ne pouvez pas vous donner de l'argent à vous-même.`, COLORS.ERROR)]
            });
        }

        const sender = await db.getUser(message.author.id);
        const targetData = await db.getUser(target.id);
        
        // --- Cooldown Logic (Per Recipient) ---
        const now = Date.now();
        const cooldownMs = 2 * 60 * 60 * 1000; // 2 heures fixe par destinataire
        const cooldownKey = `${message.author.id}-${target.id}`;
        const lastGiftToTarget = recipientCooldowns.get(cooldownKey) || 0;

        if (now - lastGiftToTarget < cooldownMs) {
            const remaining = cooldownMs - (now - lastGiftToTarget);
            const minutes = Math.floor(remaining / (60 * 1000));
            const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
            
            let timeStr = "";
            if (minutes >= 60) {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                timeStr = `**${hours}h ${mins}m**`;
            } else {
                timeStr = `**${minutes}m ${seconds}s**`;
            }

            return message.reply({ 
                embeds: [createEmbed('Cooldown ⏳', `Vous devez attendre ${timeStr} avant de pouvoir refaire un don à **${target.username}**.\n*(Le cooldown de 2h est par utilisateur)*`, COLORS.ERROR)]
            });
        }
        // --------------------------------------

        // --- Protection Nouveaux (Requirement 1) ---
        const member = await message.guild.members.fetch(target.id).catch(() => null);
        if (member && member.joinedAt) {
            const threeDaysMs = 72 * 60 * 60 * 1000;
            const isNew = (Date.now() - member.joinedAt.getTime()) < threeDaysMs;
            
            if (isNew && amount > 30000n) {
                return message.reply({ 
                    embeds: [createEmbed('Protection Anti-Abus 🛡️', `Cet utilisateur est trop nouveau pour recevoir plus de 30 000 coins (limite de 72h).`, COLORS.ERROR)]
                });
            }
        }
        // ----------------------------------------

        // --- Plafond basé sur le Prestige (Requirement 2) ---
        const recipientPrestige = parseInt(targetData.prestige || 0);
        let maxByPrestige;

        if (recipientPrestige >= 8) {
            maxByPrestige = 500000000000n; // 500 Milliards
        } else {
            const nextPrestige = PRESTIGE_LEVELS.find(p => p.level === recipientPrestige + 1);
            if (nextPrestige) {
                maxByPrestige = BigInt(nextPrestige.price);
            } else {
                maxByPrestige = 500000000000n;
            }
        }

        if (amount > maxByPrestige) {
            return message.reply({ 
                embeds: [createEmbed('Limite de transfert 🛡️', `Le montant maximum que vous pouvez envoyer à cet utilisateur est de **${formatCoins(maxByPrestige)}** (ce don ne peut pas dépasser le prix de son prochain palier de prestige).`, COLORS.ERROR)]
            });
        }
        // ----------------------------------------------------

        if (BigInt(sender.balance) < amount) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Solde insuffisant. Vous n'avez que ${formatCoins(sender.balance)}.`, COLORS.ERROR)]
            });
        }

        await db.updateGift(message.author.id, now);
        recipientCooldowns.set(cooldownKey, now);
        await db.updateBalance(message.author.id, -amount, 'Gift: Envoi');
        await db.updateBalance(target.id, amount, 'Gift: Reçu');

        // --- Achievements Engine ---
        await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'SOCIAL', {
            action: 'send',
            amount: amount,
            targetId: target.id
        });
        await achievementsHelper.triggerEvent(message.client, db, target.id, 'SOCIAL', {
            action: 'receive',
            amount: amount,
            targetId: message.author.id
        });
        await achievementsHelper.triggerEvent(message.client, db, message.author.id, 'CAPITAL', {});
        await achievementsHelper.triggerEvent(message.client, db, target.id, 'CAPITAL', {});
        // ---------------------------

        const embed = createEmbed(
            'Transfert réussi 🎁',
            `Vous avez donné ${formatCoins(amount)} à **${target.username}**.`,
            COLORS.SUCCESS
        );

        message.reply({ embeds: [embed] });
    }
};
