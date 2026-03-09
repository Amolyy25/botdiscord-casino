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
            // --- WARMUP ---
            await replyMsg.edit({ 
                embeds: [createEmbed('Initialisation... ⏳', 'Préchauffage de la base de données...', COLORS.GOLD)] 
            });
            // Warmup DB connection
            const warmupStart = Date.now();
            await db.ping(); 
            const warmupTime = Date.now() - warmupStart;

            // --- TEST 1: Latence Discord API (RTT) ---
            const startApi = Date.now();
            await replyMsg.edit({ 
                embeds: [createEmbed('Test 1/5 : API Discord...', 'Mesure de la latence RTT.', COLORS.GOLD)] 
            });
            const endApi = Date.now();
            const apiLatency = endApi - startApi;
            results.push({ name: '📶 API Discord (RTT)', value: `${apiLatency}ms`, status: apiLatency < 300 ? '✅' : '⚠️' });

            // --- TEST 2: Latence DB Ping (Réseau pur) ---
            const pingLatency = await db.ping();
            results.push({ name: '🌐 DB Ping (Réseau)', value: `${pingLatency}ms`, status: pingLatency < 100 ? '✅' : '⚠️' });

            // --- TEST 3: Latence Base de Données (Lecture) ---
            const startDbRead = Date.now();
            await db.getUser(message.author.id);
            const endDbRead = Date.now();
            const dbReadLatency = endDbRead - startDbRead;
            results.push({ name: '💾 DB Lecture (getUser)', value: `${dbReadLatency}ms`, status: dbReadLatency < 100 ? '✅' : '⚠️' });

            // --- TEST 4: Latence Base de Données (Écriture) ---
            const startDbWrite = Date.now();
            // Opération neutre : ajouter 0 SCoins
            await db.updateBalance(message.author.id, 0);
            const endDbWrite = Date.now();
            const dbWriteLatency = endDbWrite - startDbWrite;
            results.push({ name: '💾 DB Écriture (updateBalance)', value: `${dbWriteLatency}ms`, status: dbWriteLatency < 150 ? '✅' : '⚠️' });

            // --- TEST 5: Performance CPU / Logique ---
            const startCpu = Date.now();
            let count = 0;
            for (let i = 0; i < 1000000; i++) {
                count += Math.sqrt(i);
            }
            const endCpu = Date.now();
            const cpuTime = endCpu - startCpu;
            results.push({ name: '⚙️ CPU (1M Math.sqrt)', value: `${cpuTime}ms`, status: cpuTime < 50 ? '✅' : '⚠️' });

            // --- TEST 6: Stress Test Simulation (15, 30, 100 users) ---
            const stressLevels = [15, 30, 100];
            const stressResults = [];

            for (const users of stressLevels) {
                await replyMsg.edit({ 
                    embeds: [createEmbed(`Stress Test : ${users} Joueurs... ⏳`, `Simulation de ${users} parties simultanées (Lecture + Écriture DB)`, COLORS.GOLD)] 
                });

                const startStress = Date.now();
                const promises = [];

                // Simulate 'users' concurrent game sessions
                // Each session does: 1 getUser (read) + 1 updateBalance (write)
                for (let i = 0; i < users; i++) {
                    promises.push((async () => {
                        await db.getUser(message.author.id); // Read
                        await db.updateBalance(message.author.id, 0); // Write
                    })());
                }

                await Promise.all(promises);
                const endStress = Date.now();
                const duration = endStress - startStress;
                const avgPerUser = (duration / users).toFixed(2);
                
                let status = '✅';
                if (avgPerUser > 100) status = '⚠️';
                if (avgPerUser > 500) status = '❌';

                stressResults.push({
                    users: users,
                    totalTime: duration,
                    avgTime: avgPerUser,
                    status: status
                });
            }

            // --- Construction du Rapport Final ---
            const finalEmbed = new EmbedBuilder()
                .setTitle('📊 Rapport de Performance Système')
                .setColor(COLORS.VIOLET)
                .setTimestamp()
                .setDescription(`Diagnostique effectué pour **${message.guild.name}**\n*Warmup DB: ${warmupTime}ms*`)
                .addFields(
                    results.map(r => ({
                        name: `${r.status} ${r.name}`,
                        value: `**${r.value}**`,
                        inline: true
                    }))
                );

            // Ajout de la section Stress Test
            let stressDesc = "";
            for (const res of stressResults) {
                stressDesc += `${res.status} **${res.users} Joueurs** : ${res.totalTime}ms total (${res.avgTime}ms/joueur)\n`;
            }
            
            finalEmbed.addFields({ name: '🔥 Simulation de Charge (DB Read+Write)', value: stressDesc || "Aucune donnée" });

            // Ajout d'une conclusion globale
            let conclusion = "Le système est stable et réactif.";
            if (dbReadLatency > 150) conclusion = "⚠️ Latence DB Lecture élevée. Vérifiez les index ou la charge.";
            if (pingLatency > 150) conclusion = "⚠️ Latence Réseau DB élevée. Le serveur DB est loin.";
            if (apiLatency > 400) conclusion = "⚠️ Latence API Discord critique.";
            
            // Check stress test results for conclusion
            const heavyLoad = stressResults.find(r => r.users === 100);
            if (heavyLoad && heavyLoad.avgTime > 200) {
                conclusion += "\n⚠️ Le bot commence à ralentir avec 100 joueurs simultanés.";
            }

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
