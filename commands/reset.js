const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { createEmbed, COLORS, formatCoins } = require('../utils');
const { PRESTIGE_LEVELS } = require('../prestigeConfig');

module.exports = {
    name: 'reset',
    aliases: ['prestige'],
    description: 'Réinitialise votre solde pour augmenter votre niveau de Prestige',
    async execute(message, args, db) {
        try {
            // 1. Récupérer les données de l'utilisateur
            const user = await db.getUser(message.author.id);
            const currentPrestige = parseInt(user.prestige || 0);
            const nextLevel = currentPrestige + 1;

            // 2. Vérifier s'il reste des paliers de prestige
            const nextPrestigeConfig = PRESTIGE_LEVELS.find(p => p.level === nextLevel);

            if (!nextPrestigeConfig) {
                return message.reply({
                    embeds: [createEmbed(
                        'Prestige Maximum',
                        `Bravo ! Vous avez déjà atteint le niveau maximum de prestige (**Niveau ${currentPrestige}**).`,
                        COLORS.GOLD
                    )]
                });
            }

            // 3. Vérifier si l'utilisateur a assez d'argent
            const price = BigInt(nextPrestigeConfig.price);
            if (BigInt(user.balance) < price) {
                return message.reply({
                    embeds: [createEmbed(
                        'Fonds Insuffisants',
                        `Vous avez besoin de **${formatCoins(price, false)}** pour passer au ${nextPrestigeConfig.name}.\n\n` +
                        `Votre solde actuel : **${formatCoins(user.balance, false)}**`,
                        COLORS.ERROR
                    )]
                });
            }

            // 4. Créer l'Embed de confirmation
            const confirmationEmbed = createEmbed(
                `Ascension vers le ${nextPrestigeConfig.name}`,
                `Vous êtes sur le point de passer au niveau de prestige supérieur.\n\n` +
                `**Coût du palier :** ${formatCoins(price, false)}\n\n` +
                `**Récompenses débloquées :**\n` +
                nextPrestigeConfig.rewards.map(r => `• ${r}`).join('\n') + `\n\n` +
                `**Attention :** Votre solde de coins sera remis à **0** après cette opération.`,
                COLORS.PRIMARY
            );

            // 5. Créer les boutons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_prestige')
                        .setLabel('Confirmer l\'ascension')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('cancel_prestige')
                        .setLabel('Annuler')
                        .setStyle(ButtonStyle.Danger)
                );

            const response = await message.reply({
                embeds: [confirmationEmbed],
                components: [row]
            });

            // 6. Créer le collecteur de boutons
            const filter = i => i.user.id === message.author.id;
            try {
                const confirmation = await response.awaitMessageComponent({ 
                    filter, 
                    componentType: ComponentType.Button,
                    time: 60000 
                });

                if (confirmation.customId === 'confirm_prestige') {
                    // Re-vérifier le solde au cas où il aurait changé pendant l'attente
                    const freshUser = await db.getUser(message.author.id);
                    if (BigInt(freshUser.balance) < price) {
                        return confirmation.update({
                            embeds: [createEmbed(
                                'Erreur',
                                'Votre solde a changé et vous n\'avez plus assez de coins.',
                                COLORS.ERROR
                            )],
                            components: []
                        });
                    }

                    // Exécuter la logique de prestige
                    await db.updatePrestige(message.author.id, nextLevel);

                    // Donner le rôle
                    try {
                        const member = await message.guild.members.fetch(message.author.id);
                        const role = message.guild.roles.cache.get(nextPrestigeConfig.roleId);
                        if (role) {
                            await member.roles.add(role);
                        }
                    } catch (roleErr) {
                        console.error('Erreur lors de l\'attribution du rôle de prestige:', roleErr);
                    }

                    const successEmbed = createEmbed(
                        'Félicitations !',
                        `Vous avez atteint le **${nextPrestigeConfig.name}** !\n\n` +
                        `Vos nouveaux avantages sont désormais actifs.\n` +
                        `Votre solde a été réinitialisé.`,
                        COLORS.SUCCESS
                    );

                    await confirmation.update({
                        embeds: [successEmbed],
                        components: []
                    });

                } else {
                    await confirmation.update({
                        embeds: [createEmbed(
                            'Annulé',
                            'La demande de prestige a été annulée.',
                            COLORS.ERROR
                        )],
                        components: []
                    });
                }
            } catch (e) {
                if (e.code === 'InteractionCollectorError') {
                    await response.edit({
                        embeds: [createEmbed(
                            'Délai Expiré',
                            'La demande de prestige a expiré.',
                            COLORS.ERROR
                        )],
                        components: []
                    }).catch(() => {});
                } else {
                    throw e; // Laisse le catch externe gérer les autres erreurs
                }
            }
        } catch (error) {
            console.error('[Reset Command Error]', error);
            message.channel.send(`❌ Erreur technique dans ;reset : \`${error.message}\``).catch(() => {});
        }
    }
};
