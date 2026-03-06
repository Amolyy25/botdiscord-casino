const { createEmbed, COLORS, formatCoins, parseAmount } = require('../utils');
const achievementsHelper = require('../helpers/achievementsHelper');

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
        const senderMember = message.member;
        
        // --- Cooldown Logic ---
        const now = Date.now();
        const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
        const isSenderNew = senderMember && senderMember.joinedAt && (now - senderMember.joinedAt.getTime()) < seventyTwoHoursMs;
        
        const cooldownMs = isSenderNew ? (2 * 60 * 60 * 1000) : (30 * 60 * 1000);
        const lastGift = BigInt(sender.last_gift || 0);

        if (BigInt(now) - lastGift < BigInt(cooldownMs)) {
            const remaining = BigInt(cooldownMs) - (BigInt(now) - lastGift);
            const minutes = Number(remaining / BigInt(60 * 1000));
            const seconds = Number((remaining % BigInt(60 * 1000)) / BigInt(1000));
            
            let timeStr = "";
            if (minutes >= 60) {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                timeStr = `**${hours}h ${mins}m**`;
            } else {
                timeStr = `**${minutes}m ${seconds}s**`;
            }

            return message.reply({ 
                embeds: [createEmbed('Cooldown ⏳', `Vous devez attendre ${timeStr} avant de pouvoir refaire un don.\n*(Cooldown: ${isSenderNew ? '2h pour les nouveaux' : '30m'})*`, COLORS.ERROR)]
            });
        }
        // ----------------------

        // --- Protection Fame (New User Limit) ---
        const member = await message.guild.members.fetch(target.id).catch(() => null);
        if (member && member.joinedAt) {
            const threeDaysMs = 72 * 60 * 60 * 1000;
            const isNew = (Date.now() - member.joinedAt.getTime()) < threeDaysMs;
            
            if (isNew && amount > 30000n) {
                return message.reply({ 
                    embeds: [createEmbed('Protection Anti-Abus 🛡️', `Vous ne pouvez pas donner plus de **${formatCoins(30000)}** à un utilisateur qui a rejoint le serveur depuis moins de 72h.`, COLORS.ERROR)]
                });
            }
        }
        // ----------------------------------------

        if (BigInt(sender.balance) < amount) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Solde insuffisant. Vous n'avez que ${formatCoins(sender.balance)}.`, COLORS.ERROR)]
            });
        }

        await db.updateGift(message.author.id, now);
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
