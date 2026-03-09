const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS } = require('../utils');

module.exports = {
    name: 'addbox',
    description: 'Donne une Mystery Box à un utilisateur (Admin)',
    async execute(message, args, db) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Permission insuffisante.`, COLORS.ERROR)]
            });
        }

        let target = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;

        if (!target && rawId) {
            try {
                target = await message.client.users.fetch(rawId);
            } catch (e) {
                target = null;
            }
        }

        if (!target) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;addbox @user/ID [TYPE:VALEUR:LABEL]\`\n\n*Exemple:* \`;addbox @user COINS:10000:10 000 SCoins\`\n*Défaut:* \`COINS:5000:5 000 SCoins\``, COLORS.ERROR)]
            });
        }

        // Parse prize info or use default
        let prizeRaw = args[1] || 'COINS:5000:5 000 SCoins';
        const parts = prizeRaw.split(':');
        
        if (parts.length < 3) {
            return message.reply({
                embeds: [createEmbed('Erreur', 'Format de récompense invalide. Utilisez `TYPE:VALEUR:LABEL`.', COLORS.ERROR)]
            });
        }

        const type = parts[0].toUpperCase();
        const value = parts[1];
        const label = parts.slice(2).join(':');

        if (!['COINS', 'TIRAGES', 'ROLE', 'TEMP_ROLE', 'NITRO'].includes(type)) {
            return message.reply({
                embeds: [createEmbed('Erreur', `Type de récompense invalide : \`${type}\`.`, COLORS.ERROR)]
            });
        }

        try {
            // 1. Give the box in database
            const box = await db.giveMysteryBox(
                target.id,
                message.guild.id,
                null, // No giveaway ID
                type,
                value,
                label
            );

            // 2. Send the choice message (same as giveaway end)
            const choiceEmbed = new EmbedBuilder()
                .setTitle('🎁 Mystery Box Reçue !')
                .setColor('#FFFFFF')
                .setDescription(
                  `Félicitations <@${target.id}> !\n` +
                  `Un administrateur t'a offert une Mystery Box.\n\n` +
                  `Tu as le choix entre deux options :\n\n` +
                  `**Récompense garantie :** ${label}\n` +
                  `**Mystery Box :** Lot mystère possible (Légendaire, Épique, Rare, Commun)\n\n` +
                  `*Quel risque vas-tu prendre ?*`
                )
                .setFooter({ text: `Box: #${box.id} · Donné par ${message.author.username}` })
                .setTimestamp();

            const choiceRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId(`mb_choose_default_${box.id}`)
                  .setLabel(`Prendre : ${label}`)
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`mb_choose_box_${box.id}`)
                  .setLabel('Ouvrir la Mystery Box')
                  .setStyle(ButtonStyle.Danger)
            );

            await message.channel.send({
                content: `<@${target.id}>`,
                embeds: [choiceEmbed],
                components: [choiceRow],
            });

            // 3. Confirm to admin (silent or small)
            if (message.deletable) await message.delete().catch(() => {});

        } catch (err) {
            console.error('[AddBox] Erreur:', err);
            message.reply({ content: `❌ Une erreur est survenue : ${err.message}` });
        }
    }
};
