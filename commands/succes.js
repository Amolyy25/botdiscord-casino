const { createEmbed } = require('../utils');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: 'succes',
    description: 'Affiche vos succès débloqués et votre progression',
    async execute(message, args, db) {
        // Lire le fichier json des succès
        const succesPath = path.join(__dirname, '..', 'succes.json');
        let succesData;
        try {
            succesData = JSON.parse(fs.readFileSync(succesPath, 'utf-8'));
        } catch (error) {
            console.error('Erreur lors de la lecture de succes.json:', error);
            return message.reply("Erreur interne lors de la lecture des succès.");
        }

        const allAchievements = succesData.achievements || [];
        const totalCount = allAchievements.length;

        // Récupérer le profil du joueur
        let user;
        try {
            user = await db.getUser(message.author.id);
        } catch (error) {
            console.error('Erreur lors de la récupération de l\'utilisateur:', error);
            return message.reply("Erreur lors de la récupération de votre profil.");
        }

        let userAch = user.achievements || {};
        if (typeof userAch === 'string') {
            try {
                userAch = JSON.parse(userAch);
            } catch (e) {
                userAch = {};
            }
        }

        // Identifier les succès débloqués
        const unlockedAchievements = [];
        for (const ach of allAchievements) {
            if (userAch[ach.id] === true) {
                unlockedAchievements.push(ach);
            }
        }

        const unlockedCount = unlockedAchievements.length;
        const color = '#FFFFFF'; // Style Monochrome (Le Secteur)

        let description = `**Progression : ${unlockedCount} / ${totalCount} succès**\n\n`;

        if (unlockedCount === 0) {
            description += "*Vous n'avez encore débloqué aucun succès. Jouez pour révéler les secrets du casino !*";
        } else {
            description += `*Les succès non obtenus restent cachés pour préserver la surprise.*\n\n`;

            for (const ach of unlockedAchievements) {
                description += `🏆 **${ach.name}** : *${ach.description}*\n`;
            }
        }

        const embed = createEmbed(
            `Succès de ${message.author.username}`,
            description,
            color
        );
        embed.setThumbnail(message.author.displayAvatarURL({ dynamic: true }));

        return message.reply({ embeds: [embed] });
    }
};
