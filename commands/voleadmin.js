const { createEmbed, COLORS, formatCoins } = require('../utils');
const eventsManager = require('../events/eventsManager');

module.exports = {
    name: 'voleadmin',
    description: 'Force le déclenchement de Vol de Génie (Admin)',
    async execute(message, args, db) {
        // Permissions check (Admin only)
        if (!message.member.roles.cache.has('1471886110434132137') && !message.member.permissions.has('Administrator')) {
            return message.reply({ content: '❌ Commande réservée aux administrateurs.', flags: 64 });
        }

        let target = message.mentions.users.first();
        if (!target) {
            return message.reply({ content: '❌ Mentionnez un utilisateur cible.' });
        }

        // Force trigger hack: temporarily modify chance or just call logic
        // We will manually call the internal logic by copying it or exporting a force method?
        // Or cleaner: modify eventsManager to accept a force flag? 
        // For now, let's just simulate the call and print the result.
        
        message.reply(`🧪 Test Vol de Génie sur **${target.username}**...`);

        // Mock the random check in eventsManager by overriding it temporarily or just copy logic?
        // Since we can't easily override without modifying eventsManager, let's just call it and hope we get lucky?
        // No, that's bad testing.
        // Let's modify eventsManager to accept a 'force' param check?
        // But triggerVolDeGenie takes (message, db, target).
        // Let's actually add a "force" param to triggerVolDeGenie in eventsManager.js first?
        // Or better, let's just implement the logic here directly since it is for testing.
        
        // Actually, let's just call triggerVolDeGenie and see if we can force it.
        // In eventsManager.js, it does `if (Math.random() > VOLE_GENIE_CHANCE) return { triggered: false };`
        // We can't force it easily without a code change.
        
        // Let's modify eventsManager.js to export a `testVolDeGenie` or accept a force flag.
        // I'll update eventsManager.js first in the checking step to allow forcing.
        
        // Wait, I can just reimplement the quiz logic here for testing if the goal is just to see the embed.
        // But the user wants to test the "event".
        
        // Let's assume I updated eventsManager to take a 'force' arg.
        // Code below assumes I will update eventsManager.js next.
        
        const result = await eventsManager.triggerVolDeGenie(message, db, target, true); // true = force
        
        if (result.triggered) {
            if (result.success) {
                message.channel.send(`✅ Résultat du test : **SUCCÈS** (Bonus activé)`);
            } else {
                message.channel.send(`❌ Résultat du test : **ÉCHEC** (Amende appliquée)`);
            }
        } else {
            message.channel.send(`⚠️ Le test n'a pas déclenché l'événement (Normal si pas forcé).`);
        }
    }
};
