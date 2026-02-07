const { createEmbed, COLORS, formatCoins } = require('../utils');

module.exports = {
    name: 'leaderboard',
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

        let description = '';
        for (let i = 0; i < leaderboard.length; i++) {
            const entry = leaderboard[i];
            const position = i + 1;
            
            let medal = '';
            if (position === 1) medal = '🥇';
            else if (position === 2) medal = '🥈';
            else if (position === 3) medal = '🥉';
            else medal = `**${position}.**`;

            // Try to fetch username
            let displayName;
            try {
                const user = await message.client.users.fetch(entry.id);
                displayName = user.username;
            } catch (e) {
                displayName = `<@${entry.id}>`;
            }

            description += `${medal} ${displayName} - ${formatCoins(entry.balance)}\n`;
        }

        const embed = createEmbed(
            `🏆 Leaderboard - Top ${limit}`,
            description,
            COLORS.GOLD
        );

        message.reply({ embeds: [embed] });
    }
};
