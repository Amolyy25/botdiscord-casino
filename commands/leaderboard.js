const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'leaderboard',
    aliases: ['top', 'lead'],
    description: 'Affiche le classement des joueurs les plus riches',
    async execute(message, args, db) {
        const limit = parseInt(args[0]) || 10;
        
        if (limit < 1 || limit > 25) {
            return message.reply({ 
                embeds: [createEmbed('Erreur', `Le nombre de joueurs doit être entre 1 et 25.`, COLORS.ERROR)]
            });
        }

        const leaderboard = await db.getLeaderboard(limit);

        if (leaderboard.length === 0) {
            return message.reply({ 
                embeds: [createEmbed('Leaderboard', `Aucun joueur trouvé.`, COLORS.PRIMARY)]
            });
        }

        // Fetch users in parallel for speed
        const entries = await Promise.all(leaderboard.map(async (entry) => {
            let displayName;
            try {
                // Try cache first
                const user = message.client.users.cache.get(entry.id) || await message.client.users.fetch(entry.id);
                displayName = user.username;
            } catch (e) {
                displayName = `<@${entry.id}>`;
            }
            return { ...entry, displayName };
        }));

        let description = '';
        entries.forEach((entry, i) => {
            const position = i + 1;
            
            let medal = '';
            if (position === 1) medal = '🥇';
            else if (position === 2) medal = '🥈';
            else if (position === 3) medal = '🥉';
            else medal = `**${position}.**`;

            description += `${medal} ${entry.displayName} - ${formatCoins(entry.balance)}\n`;
        });

        const embed = createEmbed(
            `🏆 Leaderboard - Top ${limit}`,
            description,
            COLORS.GOLD
        );

        message.reply({ embeds: [embed] });
    }
};
