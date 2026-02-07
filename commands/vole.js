const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'vole',
    description: 'Tente de voler un utilisateur',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const now = Date.now();
        const cooldown = 2 * 60 * 60 * 1000; // 2 hours

        if (now - parseInt(user.last_vole || 0) < cooldown) {
            const remaining = cooldown - (now - parseInt(user.last_vole));
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
            
            return message.reply({ 
                embeds: [createEmbed('Pas si vite ! 🖐️', `Vous devez attendre **${hours}h ${minutes}m** avant de pouvoir voler à nouveau.`, COLORS.ERROR)]
            });
        }

        let target = message.mentions.users.first();
        const rawId = args[0] ? args[0].replace(/[<@!>]/g, '') : null;

        if (!target && rawId) {
            try {
                target = await message.client.users.fetch(rawId);
            } catch (e) {}
        }

        if (!target || target.id === message.author.id) {
            return message.reply({ 
                embeds: [createEmbed('Usage', `Format: \`;vole @user/ID\``, COLORS.ERROR)]
            });
        }

        const targetData = await db.getUser(target.id);
        if (BigInt(targetData.balance) < 50n) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Cet utilisateur est trop pauvre pour être volé !`, COLORS.ERROR)]
            });
        }

        const balanceNum = Number(targetData.balance);
        const stealAmount = BigInt(Math.floor(balanceNum * (Math.random() * 0.2 + 0.1)));

        await db.updateVole(message.author.id, now);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('stop_robbery')
                .setLabel('ARRETER LE VOL')
                .setStyle(ButtonStyle.Danger)
        );

        const channelEmbed = createEmbed(
            '⚠️ Tentative de Vol !',
            `**${message.author.username}** tente de voler **${target.username}** !\n\n` +
            `Victime, vous avez **20 secondes** pour cliquer sur le bouton ci-dessous pour arrêter le voleur !`,
            COLORS.VIOLET
        );

        const mainMsg = await message.channel.send({ 
            content: `<@${target.id}>`,
            embeds: [channelEmbed],
            components: [row]
        });

        try {
            const dmEmbed = createEmbed(
                '🚨 ON VOUS VOLE !',
                `⚠️ **${message.author.username}** est en train de vous dévaliser !\n\n` +
                `📍 [CLIQUEZ ICI POUR ACCÉDER AU SALON](${mainMsg.url})\n\n` +
                `Vous avez exactement **20 secondes** pour appuyer sur **ARRETER LE VOL** !`,
                COLORS.ERROR
            );
            await target.send({ embeds: [dmEmbed] });
        } catch (e) {}

        const collector = mainMsg.createMessageComponentCollector({ 
            filter: i => i.user.id === target.id && i.customId === 'stop_robbery',
            time: 20000 
        });

        let stopped = false;
        collector.on('collect', async i => {
            stopped = true;
            collector.stop();
            await i.update({ 
                content: null,
                embeds: [createEmbed('Vol échoué 🛡️', `**${target.username}** a été plus rapide ! Le vol est annulé.`, COLORS.SUCCESS)],
                components: [] 
            });
        });

        collector.on('end', async () => {
            if (!stopped) {
                const latestTarget = await db.getUser(target.id);
                const finalSteal = stealAmount > BigInt(latestTarget.balance) ? BigInt(latestTarget.balance) : stealAmount;
                
                if (finalSteal > 0n) {
                    await db.updateBalance(target.id, -finalSteal);
                    await db.updateBalance(message.author.id, finalSteal);

                    mainMsg.edit({ 
                        content: null,
                        embeds: [createEmbed('Vol réussi! 💰', `**${message.author.username}** a réussi à voler ${formatCoins(finalSteal)} à **${target.username}** !`, COLORS.ERROR)],
                        components: [] 
                    }).catch(() => {});
                } else {
                    mainMsg.edit({ 
                        content: null,
                        embeds: [createEmbed('Vol échoué ❌', `La victime n'a plus rien en poche !`, COLORS.ERROR)],
                        components: [] 
                    }).catch(() => {});
                }
            }
        });
    }
};
