const { PermissionFlagsBits } = require('discord.js');
const { startEvent } = require('../events/mafiaRacket');

module.exports = {
    name: 'testmafia',
    description: 'Lance l\'événement Mafia Racket pour test (Admin uniquement)',
    async execute(message, args, db) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply("Cette commande est réservée aux administrateurs.");
        }

        await message.reply("⚡ Lancement manuel du protocole **MAFIA RACKET**...");
        
        try {
            await startEvent(message.client, db, message.channel);
        } catch (err) {
            console.error("[TestMafia] Erreur:", err);
            message.channel.send(`❌ Erreur lors du lancement de l'évenement : ${err.message}`);
        }
    }
};
