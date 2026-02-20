const { createEmbed, COLORS } = require('../utils');

module.exports = {
    name: 'help',
    description: 'Affiche la liste des commandes',
    async execute(message, args, db) {
        const prefix = process.env.PREFIX || ';';
        const commands = [
            `**Général**`,
            `\`${prefix}bal\` - Voir votre solde`,
            `\`${prefix}profil [@user/ID]\` - Voir le profil d'un joueur`,
            `\`${prefix}leaderboard [nombre]\` - Top des joueurs (max 25)`,
            `\`${prefix}daily\` - Récupérer 500 coins quotidiennement`,
            `\`${prefix}collect\` - Récupérer 150 coins toutes les 30 min`,
            `\`${prefix}gift @user/ID [montant]\` - Donner des coins`,
            `\`${prefix}reset\` - Augmenter votre niveau de Prestige (Reset solde)`,
            `\`${prefix}vole @user/ID\` - Tenter de voler un utilisateur`,
            `\`${prefix}boost\` - Récupérer votre boost quotidien (Soutien/Booster)`,
            ``,
            `**Tirages 🎫**`,
            `\`${prefix}tirage\` - Effectuer un tirage pour obtenir un rôle`,
            `\`${prefix}weeklytirages\` - Récupérer vos tirages hebdomadaires (Booster/Premium)`,
            ``,
            `**Jeux**`,
            `\`${prefix}bj [mise/all]\` - Blackjack`,
            `\`${prefix}roulette [mise/all] [rouge/noir/vert]\` - Roulette`,
            `\`${prefix}cf [mise/all] [pile/face]\` - Coinflip`,
            `\`${prefix}crash [mise/all]\` - Crash`,
            `\`${prefix}mines [mise/all] [mines]\` - Mines (mn)`,
            `\`${prefix}towers [mise/all]\` - Towers (tw)`,
            ``,
            `**Admin**`,
            `\`${prefix}setupcasino\` - Configurer le système de casino`,
            `\`${prefix}bal @user/ID\` - Voir le solde d'un joueur`,
            `\`${prefix}addmoney @user/ID [montant]\` - Ajouter des coins`,
            `\`${prefix}removemoney @user/ID [montant]\` - Retirer des coins`,
            `\`${prefix}setmoney @user/ID [montant]\` - Définir le solde`,
            `\`${prefix}givetirages @user/ID [nombre]\` - Donner des tirages`
        ];

        const embed = createEmbed(
            'Aide Casino 🪙',
            commands.join('\n')
        );

        message.reply({ embeds: [embed] });
    }
};
