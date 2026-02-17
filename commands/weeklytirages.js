const { createEmbed, COLORS } = require('../utils');
const { BOOSTER_ROLE_ID, PREMIUM_ROLE_ID } = require('../roleConfig');

module.exports = {
    name: 'weeklytirages',
    description: 'Récupère vos tirages hebdomadaires (Boosters/Premium)',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const member = await message.guild.members.fetch(message.author.id);
        
        const now = Date.now();
        const weekCooldown = 7 * 24 * 60 * 60 * 1000; // 7 days
        const lastWeekly = parseInt(user.last_weekly_tirage || 0);

        if (now - lastWeekly < weekCooldown) {
            const remaining = weekCooldown - (now - lastWeekly);
            const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
            const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            
            return message.reply({ 
                embeds: [createEmbed('Pas encore disponible ! ⏳', `Vous pourrez récupérer vos tirages hebdomadaires dans **${days}j ${hours}h**.`, COLORS.ERROR)]
            });
        }

        // Check for special roles
        const hasBooster = member.roles.cache.has(BOOSTER_ROLE_ID);
        const hasPremium = member.roles.cache.has(PREMIUM_ROLE_ID);

        let tiragesEarned = 0;
        let roleName = '';

        if (hasPremium) {
            tiragesEarned = 2;
            roleName = 'Booster';
        } else if (hasBooster) {
            tiragesEarned = 1;
            roleName = 'Soutien';
        } else {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Vous devez avoir un rôle **Booster** ou **Premium** pour récupérer des tirages hebdomadaires.`, COLORS.ERROR)]
            });
        }

        await db.updateTirages(message.author.id, tiragesEarned);
        await db.updateWeeklyTirage(message.author.id, now);

        const newUser = await db.getUser(message.author.id);

        const embed = createEmbed(
            'Tirages hebdomadaires récupérés ! 🎫',
            `Grâce à votre rôle **${roleName}**, vous avez reçu **${tiragesEarned}** tirage(s) !\n\n` +
            `Total de tirages: **${newUser.tirages}** 🎫`,
            COLORS.SUCCESS
        );

        message.reply({ embeds: [embed] });
    }
};
