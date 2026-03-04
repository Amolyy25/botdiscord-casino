const { createEmbed, COLORS, formatCoins } = require("../utils");
const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType,
    PermissionFlagsBits 
} = require("discord.js");

const GIFS = {
    INFILTRATION: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGJmZDA0ZmI4ZDM4ZDM4ODU4ZDY4ZDM4ODU4ZDY4ZDM4ODU4ZDY4ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKpwzOCQiX8s00g/giphy.gif", // Mafia desk typing
    LOCKDOWN: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNmNmMzk4OWM3ZDM4ZDM4ODU4ZDY4ZDM4ODU4ZDY4ZDM4ODU4ZDY4ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/C9pf20SvxVBM4/giphy.gif", // Vault door
    TAXING: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNmNmMzk4OWM3ZDM4ZDM4ODU4ZDY4ZDM4ODU4ZDY4ZDM4ODU4ZDY4ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3oEdvbe78pM8FkG1K0/giphy.gif", // Money burning/flying
    QUESTION: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNmNmMzk4OWM3ZDM4ZDM4ODU4ZDY4ZDM4ODU4ZDY4ZDM4ODU4ZDY4ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKv6lS8TzgL7Fkc/giphy.gif", // Interrogation
    LIQUIDATION: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNmNmMzk4OWM3ZDM4ZDM4ODU4ZDY4ZDM4ODU4ZDY4ZDM4ODU4ZDY4ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/l3vRhbzYFAn8t3h8A/giphy.gif" // Game Over
};

const QUESTIONS = [
    { q: "Combien font 14 x 5 ?", a: ["70"] },
    { q: "Quelle est la capitale de l'Italie ?", a: ["rome"] },
    { q: "En quelle année a coulé le Titanic ?", a: ["1912"] },
    { q: "Quel gaz les plantes absorbent-elles ?", a: ["co2", "dioxyde de carbone"] },
    { q: "Combien d'États y a-t-il aux USA ?", a: ["50"] },
    { q: "Qui a peint la Joconde ?", a: ["da vinci", "leonard de vinci"] },
    { q: "Quelle est la racine carrée de 144 ?", a: ["12"] },
    { q: "Quel est l'océan le plus vaste ?", a: ["pacifique"] },
];

/**
 * @param {import('discord.js').Client} client 
 * @param {any} db 
 * @param {import('discord.js').TextChannel} channel 
 */
async function startEvent(client, db, channel) {
    const targets = new Map(); // userId -> { hasAssurance: false, balance: 0 }
    let eventActive = true;
    let phoenixCount = 0;
    let totalLost = 0n;

    // --- PHASE 1 : INFILTRATION (30s) ---
    const infiltrationEmbed = createEmbed(
        "🕵️ PROTOCOLE : INFILTRATION MAFIA",
        "```\n[SYSTEM] Surveillance réseau active.\nEnregistrement des signatures biométriques...\nTout message envoyé dans ce salon marquera votre terminal.\n```",
        "#000000"
    );
    infiltrationEmbed.setImage(GIFS.INFILTRATION);
    await channel.send({ embeds: [infiltrationEmbed] });

    const filterInfiltration = (m) => !m.author.bot;
    const collectorInfiltration = channel.createMessageCollector({ filter: filterInfiltration, time: 30000 });

    collectorInfiltration.on('collect', (m) => {
        if (!targets.has(m.author.id)) {
            targets.set(m.author.id, { hasAssurance: false });
            console.log(`[Mafia] Target recorded: ${m.author.tag}`);
        }
    });

    await new Promise(resolve => collectorInfiltration.on('end', resolve));

    if (targets.size === 0) {
        return channel.send({ embeds: [createEmbed("EVENT ANNULÉ", "Aucune cible détectée dans le Secteur.", "#000000")] });
    }

    // --- PHASE 1.5 : ASSURANCE (15s) ---
    // Lockdown immediate
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        [PermissionFlagsBits.SendMessages]: false
    }).catch(e => console.error("[Mafia] Error locking channel:", e.message));

    const assuranceEmbed = createEmbed(
        "🛡️ PROTOCOLE : RACKET MAFIA - PROTECTION",
        "```\n[SYSTEM] Le Secteur est sous contrôle Mafia.\nUne taxe exponentielle va être prélevée.\n\nASSURANCE (0.12% du solde, min 50k) :\n- Immunité contre le SABOTAGE (pénalité collective).\n- Les taxes normales s'appliquent toujours.\n```",
        "#000000"
    );
    assuranceEmbed.setImage(GIFS.LOCKDOWN);

    const buyButton = new ButtonBuilder()
        .setCustomId('buy_assurance')
        .setLabel('Acheter l\'Assurance')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(buyButton);
    const assuranceMsg = await channel.send({ embeds: [assuranceEmbed], components: [row] });

    const collectorAssurance = assuranceMsg.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: 15000 
    });

    collectorAssurance.on('collect', async (i) => {
        if (!targets.has(i.user.id)) {
            return i.reply({ content: "Vous n'étiez pas dans le périmètre d'infiltration.", ephemeral: true });
        }
        if (targets.get(i.user.id).hasAssurance) {
            return i.reply({ content: "Vous avez déjà une assurance.", ephemeral: true });
        }

        const user = await db.getUser(i.user.id);
        const price = BigInt(Math.max(50000, Math.floor(Number(user.balance) * 0.0012)));

        if (BigInt(user.balance) < price) {
            return i.reply({ content: `Solde insuffisant. Prix requis : ${formatCoins(price)}`, ephemeral: true });
        }

        await db.updateBalance(i.user.id, -price, "Achat Assurance Mafia");
        targets.get(i.user.id).hasAssurance = true;
        await i.reply({ content: `✅ Assurance acquise pour ${formatCoins(price)} !`, ephemeral: true });
    });

    await new Promise(resolve => collectorAssurance.on('end', resolve));
    await assuranceMsg.edit({ components: [] }).catch(() => null);

    // --- PHASE 2 : THE LOOP ---
    let cycleIndex = 0;
    const targetIds = Array.from(targets.keys());
    let remainingQuestions = targetIds.length - 1;
    let multiplier = 1.0;
    let activeTargets = [...targetIds];

    while (activeTargets.length > 1 && remainingQuestions > 0) {
        cycleIndex++;
        const currentTax = BigInt(Math.floor(100 * Math.pow(1.6, cycleIndex)));
        multiplier += 0.2;

        // TAX PHASE (8s LOCK)
        const taxEmbed = createEmbed(
            `💸 TAXE MAFIA - CYCLE ${cycleIndex}`,
            `\`\`\`\n[STATUT DU SECTEUR]\nCibles actives : ${activeTargets.length}\nTaxe actuelle : ${formatCoins(currentTax)}\nMultiplicateur Sabotage : x${multiplier.toFixed(1)}\n\n[ANALYSE DES SOLDES EN COURS...]\n\`\`\``,
            "#000000"
        );
        taxEmbed.setImage(GIFS.TAXING);
        const cycleMsg = await channel.send({ embeds: [taxEmbed] });

        // Apply Taxes
        for (const uid of activeTargets) {
            const user = await db.getUser(uid);
            const bal = BigInt(user.balance);
            
            if (bal < currentTax) {
                // BANKRUPTCY
                totalLost += bal;
                await db.activatePhoenix(uid);
                phoenixCount++;
                console.log(`[Mafia] Phoenix Protocol triggered for ${uid}`);
            } else {
                totalLost += currentTax;
                await db.updateBalance(uid, -currentTax, `Taxe Mafia (Cycle ${cycleIndex})`);
            }
        }

        await new Promise(r => setTimeout(r, 8000));

        // PREP PHASE (2s)
        await cycleMsg.edit({ 
            embeds: [createEmbed("⚠️ PRÉPARATION...", "```\nOuverture des terminaux dans 2 secondes...\nSOYEZ PRÊTS.\n```", "#000000")] 
        });
        await new Promise(r => setTimeout(r, 2000));

        // QUESTION PHASE
        const questionObj = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
        const qEmbed = createEmbed(
            "⚡ QUESTION FLASH MAFIA",
            `\`\`\`\n❓ QUESTION :\n${questionObj.q}\n\n[DÉLAI : 15s]\nLe premier répondant sort de la liste des cibles.\nEn cas d'erreur : Sabotage collectif.\n\`\`\``,
            "#000000"
        );
        qEmbed.setImage(GIFS.QUESTION);
        await cycleMsg.edit({ embeds: [qEmbed] });

        // UNLOCK
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            [PermissionFlagsBits.SendMessages]: true
        }).catch(() => null);

        const filterQ = (m) => activeTargets.includes(m.author.id) && !m.author.bot;
        const collectorQ = channel.createMessageCollector({ filter: filterQ, max: 1, time: 15000 });

        let answered = false;
        await new Promise(resolve => {
            collectorQ.on('collect', async (m) => {
                answered = true;
                // LOCK IMMEDIATELY
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
                    [PermissionFlagsBits.SendMessages]: false
                }).catch(() => null);

                const answer = m.content.trim().toLowerCase();
                if (questionObj.a.includes(answer)) {
                    // CORRECT
                    activeTargets = activeTargets.filter(id => id !== m.author.id);
                    await channel.send({ embeds: [createEmbed("✅ LIBÉRATION", `<@${m.author.id}> a répondu correctement et quitte le racket !`, "#000000")] });
                } else {
                    // WRONG - SABOTAGE
                    await channel.send({ embeds: [createEmbed("❌ SABOTAGE", `<@${m.author.id}> a échoué. Déclenchement de la pénalité collective !`, "#000000")] });
                    
                    for (const uid of activeTargets) {
                        if (targets.get(uid).hasAssurance) continue;
                        const user = await db.getUser(uid);
                        const penalty = BigInt(Math.floor(Number(user.balance) * 0.05 * multiplier));
                        if (penalty > 0n) {
                            await db.updateBalance(uid, -penalty, "Sabotage Mafia");
                            totalLost += penalty;
                        }
                    }
                }
                remainingQuestions--;
                resolve();
            });

            collectorQ.on('end', (collected, reason) => {
                if (reason === 'time' && !answered) {
                    channel.send({ embeds: [createEmbed("⏰ TEMPS ÉCOULÉ", "Aucune réponse reçue. Le cycle continue...", "#000000")] });
                    // RE-LOCK
                    channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
                        [PermissionFlagsBits.SendMessages]: false
                    }).catch(() => null);
                    remainingQuestions--;
                    resolve();
                }
            });
        });
    }

    // --- PHASE 3 : ENDING ---
    if (activeTargets.length > 0) {
        if (activeTargets.length === 1) {
            // LAST SURVIVOR
            const lastId = activeTargets[0];
            const finalTax = BigInt(Math.floor(100 * Math.pow(1.6, cycleIndex + 2)));
            const user = await db.getUser(lastId);
            
            await db.updateBalance(lastId, -finalTax, "Liquidation Finale Mafia");
            totalLost += finalTax;

            const liquidEmbed = createEmbed(
                "💀 DERNIER SURVIVANT : LIQUIDATION",
                `\`\`\`\n[SYSTEM] <@${lastId}> était le dernier sur la liste.\nLiquidation totale effectuée.\nTaxe finale prélevée : ${formatCoins(finalTax)}\n\`\`\``,
                "#000000"
            );
            liquidEmbed.setImage(GIFS.LIQUIDATION);
            await channel.send({ embeds: [liquidEmbed] });
        } else {
            // MASSIVE FINAL TAX
            const massTax = BigInt(Math.floor(100 * Math.pow(1.6, cycleIndex + 3)));
            for (const uid of activeTargets) {
                await db.updateBalance(uid, -massTax, "Taxe de Groupe Finale");
                totalLost += massTax;
            }
            await channel.send({ embeds: [createEmbed("🩸 LIQUIDATION COLLECTIVE", `Toutes les cibles restantes (${activeTargets.length}) ont subi une taxe massive de ${formatCoins(massTax)}.`, "#000000")] });
        }
    }

    // GRACE QUESTION
    if (phoenixCount >= 3) {
        const graceEmbed = createEmbed(
            "🕊️ PROTOCOLE DE GRÂCE",
            `\`\`\`\n[SYSTEM] Analyse : Événement dévastateur détecté (${phoenixCount} faillites).\nUne chance ultime de remboursement partiel est offerte au groupe.\n\nRépondez à cette question finale pour rembourser 25% des pertes totales (${formatCoins(totalLost / 4n)}).\n\`\`\``,
            "#000000"
        );
        const graceMsg = await channel.send({ embeds: [graceEmbed] });

        const graceQ = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
        await channel.send({ content: `**QUESTION DE GRÂCE :** ${graceQ.q}` });
        
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            [PermissionFlagsBits.SendMessages]: true
        }).catch(() => null);

        const graceCollector = channel.createMessageCollector({ time: 20000, max: 1 });
        await new Promise(resolve => {
            graceCollector.on('collect', async (m) => {
                if (graceQ.a.includes(m.content.trim().toLowerCase())) {
                    const refund = totalLost / 4n;
                    const participants = Array.from(targets.keys());
                    const refundPerUser = refund / BigInt(participants.length);
                    
                    for (const uid of participants) {
                        await db.updateBalance(uid, refundPerUser, "Remboursement Grâce Mafia");
                    }
                    await channel.send({ embeds: [createEmbed("✨ GRÂCE ACCORDÉE", `Succès ! Un total de ${formatCoins(refund)} a été redistribué aux participants.`, "#000000")] });
                } else {
                    await channel.send({ embeds: [createEmbed("🛑 GRÂCE REFUSÉE", "L'échec est définitif. Aucun remboursement.", "#000000")] });
                }
                resolve();
            });
            graceCollector.on('end', (c, reason) => { if (reason === 'time') resolve(); });
        });
    }

    // FINAL UNLOCK
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        [PermissionFlagsBits.SendMessages]: true
    }).catch(() => null);

    await channel.send({ embeds: [createEmbed("🏁 FIN DU PROTOCOLE", "Les terminaux sont de nouveau sécurisés. Fin du racket.", "#000000")] });
}

module.exports = { startEvent };
