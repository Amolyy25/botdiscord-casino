const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { createEmbed, COLORS } = require('../utils');

module.exports = {
    name: 'testall',
    description: 'Diagnostique complet des performances du bot (Admin)',
    async execute(message, args, db) {
        // 1. Check Permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ 
                embeds: [createEmbed('Accès Refusé', `Cette commande est réservée aux administrateurs.`, COLORS.ERROR)]
            });
        }

        const statusEmbed = createEmbed(
            'Diagnostique en cours... ⏳',
            'Veuillez patienter pendant l\'exécution des tests de performance.',
            COLORS.GOLD
        );
        
        const replyMsg = await message.reply({ embeds: [statusEmbed] });
        const results = [];

        try {
            // --- TEST 1: Latence Discord API (RTT) ---
            const startApi = Date.now();
            await replyMsg.edit({ 
                embeds: [createEmbed('Test 1/4 : API Discord...', 'Mesure de la latence RTT.', COLORS.GOLD)] 
            });
            const endApi = Date.now();
            const apiLatency = endApi - startApi;
            results.push({ name: '📶 API Discord (RTT)', value: `${apiLatency}ms`, status: apiLatency < 200 ? '✅' : '⚠️' });

            // --- TEST 2: Latence Base de Données (Lecture) ---
            const startDbRead = Date.now();
            await db.getUser(message.author.id);
            const endDbRead = Date.now();
            const dbReadLatency = endDbRead - startDbRead;
            results.push({ name: '💾 DB Lecture (getUser)', value: `${dbReadLatency}ms`, status: dbReadLatency < 50 ? '✅' : '⚠️' });

            // --- TEST 3: Latence Base de Données (Écriture) ---
            const startDbWrite = Date.now();
            // Opération neutre : ajouter 0 coins
            await db.updateBalance(message.author.id, 0);
            const endDbWrite = Date.now();
            const dbWriteLatency = endDbWrite - startDbWrite;
            results.push({ name: '💾 DB Écriture (updateBalance)', value: `${dbWriteLatency}ms`, status: dbWriteLatency < 100 ? '✅' : '⚠️' });

            // --- TEST 4: Performance CPU / Logique ---
            const startCpu = Date.now();
            let count = 0;
            for (let i = 0; i < 1000000; i++) {
                count += Math.sqrt(i);
            }
            const endCpu = Date.now();
            const cpuTime = endCpu - startCpu;
            results.push({ name: '⚙️ CPU (1M Math.sqrt)', value: `${cpuTime}ms`, status: cpuTime < 50 ? '✅' : '⚠️' });

            // --- Construction du Rapport Final ---
            const finalEmbed = new EmbedBuilder()
                .setTitle('📊 Rapport de Performance Système')
                .setColor(COLORS.VIOLET)
                .setTimestamp()
                .setDescription(`Diagnostique effectué pour **${message.guild.name}**`)
                .addFields(
                    results.map(r => ({
                        name: `${r.status} ${r.name}`,
                        value: `**${r.value}**`,
                        inline: true
                    }))
                );

            // Ajout d'une conclusion globale
            const totalTime = apiLatency + dbReadLatency + dbWriteLatency + cpuTime;
            let conclusion = "Le système est stable et réactif.";
            if (dbWriteLatency > 150 || dbReadLatency > 100) conclusion = "⚠️ Latence Base de Données détectée. Vérifiez la charge du serveur PG.";
            if (apiLatency > 300) conclusion = "⚠️ Latence API Discord élevée. Peut être temporaire.";

            finalEmbed.addFields({ name: 'Conclusion', value: conclusion });

            await replyMsg.edit({ embeds: [finalEmbed] });

        } catch (error) {
            console.error('Error during benchmark:', error);
            await replyMsg.edit({ 
                embeds: [createEmbed('Erreur Fatale', `Le diagnostique a échoué : ${error.message}`, COLORS.ERROR)] 
            });
        }
    }
};
