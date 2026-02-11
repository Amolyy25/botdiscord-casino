const { createEmbed, COLORS } = require('../utils');

module.exports = {
    name: 'timer',
    description: 'Affiche le temps restant avant vos prochaines commandes',
    async execute(message, args, db) {
        const user = await db.getUser(message.author.id);
        const now = Date.now();

        const cooldowns = [
            {
                name: 'Daily',
                last: parseInt(user.last_daily || 0),
                duration: 24 * 60 * 60 * 1000,
                emoji: '📅'
            },
            {
                name: 'Vole',
                last: parseInt(user.last_vole || 0),
                duration: 2 * 60 * 60 * 1000,
                emoji: '🦹'
            },
            {
                name: 'Boost',
                last: parseInt(user.last_boost || 0),
                duration: 24 * 60 * 60 * 1000,
                emoji: '🚀'
            },
            {
                name: 'Weekly Tirages',
                last: parseInt(user.last_weekly_tirage || 0),
                duration: 7 * 24 * 60 * 60 * 1000,
                emoji: '🎫'
            }
        ];

        let description = '';

        for (const cd of cooldowns) {
            const elapsed = now - cd.last;
            const remaining = cd.duration - elapsed;

            if (remaining <= 0) {
                description += `${cd.emoji} **${cd.name}** : ✅ Disponible !\n`;
            } else {
                const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
                const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
                const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
                const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

                let timeStr = '';
                if (days > 0) timeStr += `${days}j `;
                if (hours > 0 || days > 0) timeStr += `${hours}h `;
                timeStr += `${minutes}m ${seconds}s`;

                description += `${cd.emoji} **${cd.name}** : ⏳ \`${timeStr}\`\n`;
            }
        }

        const embed = createEmbed(
            'Temps de recharge ⏱️',
            description,
            COLORS.PRIMARY
        );

        message.reply({ embeds: [embed] });
    }
};
