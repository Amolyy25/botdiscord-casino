const { createEmbed, COLORS, formatCoins } = require('../utils');
const { WINS_CHANNEL_ID } = require('../roleConfig');

const activeSessions = new Map(); // userId => { startTime, currentTier }
const pendingResets = new Map();  // userId => NodeJS.Timeout

const TIERS = [
  { level: 1, mins: 5, minCoins: 1500, maxCoins: 3000, tirages: 0, name: "5 Minutes" },
  { level: 2, mins: 25, minCoins: 5000, maxCoins: 8000, tirages: 1, name: "25 Minutes" },
  { level: 3, mins: 45, minCoins: 12000, maxCoins: 18000, tirages: 2, name: "45 Minutes" },
  { level: 4, mins: 60, minCoins: 30000, maxCoins: 50000, tirages: 3, name: "1 Heure" },
  { level: 5, mins: 120, minCoins: 75000, maxCoins: 120000, tirages: 5, name: "Active Speaker" }
];

// Helper method to look up a member's valid status anywhere in the bot
function getMemberCurrentValidState(client, userId) {
    for (const guild of client.guilds.cache.values()) {
        const member = guild.members.cache.get(userId);
        if (member && member.voice && member.voice.channelId) {
            return isUserValid(member, member.voice);
        }
    }
    return false;
}

function isUserValid(member, voiceState) {
    // If the event triggered a complete disconnect, it will have no channel.
    if (!voiceState || !voiceState.channelId) {
        console.log(`[VoiceRewards] ${member.user.tag} n'a plus de channelId = invalidé.`);
        return false;
    }

    // Force fetching the most recent channel state directly from the guild cache
    const channel = member.guild.channels.cache.get(voiceState.channelId);
    if (!channel) {
        console.log(`[VoiceRewards] Channel ID ${voiceState.channelId} introuvable dans le cache.`);
        return false;
    }

    // Check member's active state
    if (voiceState.selfMute || voiceState.serverMute) {
        console.log(`[VoiceRewards] ${member.user.tag} est mute = invalidé.`);
        return false;
    }
    if (voiceState.selfDeaf || voiceState.serverDeaf) {
         console.log(`[VoiceRewards] ${member.user.tag} est blindé = invalidé.`);
         return false;
    }
    
    // We count VALID members in this channel, ensuring we don't accidentally count disconnected people
    // that Discord left stuck in the members cache. We verify they actually are connected and not bots.
    // To combat cache issues, we look at the entire guild's verified voice states for this channel.
    let validMembersCount = 0;
    
    // Safety check if voiceStates isn't available
    if (member.guild.voiceStates && member.guild.voiceStates.cache) {
        for (const [id, vs] of member.guild.voiceStates.cache.entries()) {
            if (vs.channelId === voiceState.channelId) {
                // Determine if it's a bot or if they are muted/deafened
                let isBot = false;
                if (vs.member && vs.member.user && vs.member.user.bot) isBot = true;
                
                const isMuted = vs.selfMute || vs.serverMute;
                const isDeaf = vs.selfDeaf || vs.serverDeaf;
                
                if (!isBot && !isMuted && !isDeaf) {
                    validMembersCount++;
                }
            }
        }
    } else {
        // Fallback to channel.members if voiceStates is totally unavailable
        for (const [id, m] of channel.members.entries()) {
            if (!m.user.bot && m.voice && m.voice.channelId === channel.id) {
                const isMuted = m.voice.selfMute || m.voice.serverMute;
                const isDeaf = m.voice.selfDeaf || m.voice.serverDeaf;
                if (!isMuted && !isDeaf) {
                    validMembersCount++;
                }
            }
        }
    }

    console.log(`[VoiceRewards] ${channel.name} a ${validMembersCount} membre(s) non-bot(s) physiquement présents (par VoiceStates).`);
    
    if (validMembersCount < 2) {
        console.log(`[VoiceRewards] Moins de 2 membres pour ${member.user.tag} = invalidé.`);
        return false;
    }

    return true;
}

async function init(client, db) {
    // 1. Load active sessions from DB
    try {
        const savedSessions = await db.getAllVoiceSessions();
        for (const s of savedSessions) {
            activeSessions.set(s.user_id, { 
                startTime: Number(s.start_time), 
                currentTier: s.current_tier 
            });
        }
    } catch (err) {
        console.error("[VoiceRewards] Erreur chargement BDD:", err);
    }
    
    console.log(`[VoiceRewards] Initialisation terminée. ${activeSessions.size} session(s) chargée(s). Vérification des salons en cours...`);

    // 2. Validate current state for everyone
    for (const guild of client.guilds.cache.values()) {
        for (const channel of guild.channels.cache.values()) {
            if (!channel.isVoiceBased()) continue;
            
            for (const member of channel.members.values()) {
                if (member.user.bot) continue;
                
                const valid = isUserValid(member, member.voice);
                if (valid) {
                    if (!activeSessions.has(member.id)) {
                        const now = Date.now();
                        activeSessions.set(member.id, { startTime: now, currentTier: 0 });
                        await db.saveVoiceSession(member.id, now, 0).catch(() => {});
                        console.log(`[VoiceRewards] Session démarrée pour ${member.user.tag} (${member.id})`);
                    }
                    if (pendingResets.has(member.id)) {
                        clearTimeout(pendingResets.get(member.id));
                        pendingResets.delete(member.id);
                        console.log(`[VoiceRewards] Timer d'annulation révoqué pour ${member.user.tag}`);
                    }
                } else {
                    if (activeSessions.has(member.id) && !pendingResets.has(member.id)) {
                        console.log(`[VoiceRewards] ${member.user.tag} n'est plus valide. Démarrage du timer de 30s...`);
                        startResetTimer(member.id, db);
                    }
                }
            }
        }
    }

    // 3. For any DB session that wasn't found in voice at all, start reset timer immediately
    for (const [userId, session] of activeSessions.entries()) {
        if (!pendingResets.has(userId)) {
            // Check if they are actually in a voice channel
            let inVoc = false;
            for (const guild of client.guilds.cache.values()) {
                const member = guild.members.cache.get(userId);
                if (member && member.voice && member.voice.channel) {
                    inVoc = true;
                    if (!isUserValid(member, member.voice)) {
                        startResetTimer(userId, db);
                    }
                    break;
                }
            }
            if (!inVoc) {
                startResetTimer(userId, db);
            }
        }
    }

    // 4. Set interval for checks
    setInterval(() => checkRewards(client, db), 60000); // Check every minute

    // 5. Handle user voice state updates
    client.on('voiceStateUpdate', (oldState, newState) => {
        if (newState.member.user.bot) return;
        
        console.log(`[VoiceRewards] Changement d'état vocal détecté pour ${newState.member.user.tag} (Mute: ${newState.selfMute}, Deaf: ${newState.selfDeaf}, Channel: ${newState.channelId})`);

        // If the user completely disconnects, newState.channelId is null.
        if (!newState.channelId) {
            console.log(`[VoiceRewards] ${newState.member.user.tag} s'est déconnecté du vocal.`);
            handleUserVoiceState(newState.member, newState, db);
        } else {
            // Re-evaluate the user themselves explicitly right now with their new state
            handleUserVoiceState(newState.member, newState, db);
        }

        // Re-evaluate ALL users in the affected channels because member count changed.
        const channelsToCheck = new Set();
        if (oldState.channelId) channelsToCheck.add(oldState.channelId);
        if (newState.channelId) channelsToCheck.add(newState.channelId);

        for (const channelId of channelsToCheck) {
            const channel = newState.guild.channels.cache.get(channelId) || oldState.guild.channels.cache.get(channelId);
            if (!channel) continue;
            
            // Re-fetch the channel fresh to ensure we get the accurate current members size
            const freshChannel = client.channels.cache.get(channelId);
            if (!freshChannel) continue;

            for (const member of freshChannel.members.values()) {
                if (member.user.bot) continue;
                
                // If member == the user who just updated their state, we use newState. 
                // Otherwise we use their current member.voice state.
                const stateToEvaluate = (member.id === newState.id) ? newState : member.voice;
                
                if (stateToEvaluate.channelId) {
                    handleUserVoiceState(member, stateToEvaluate, db);
                } else if (activeSessions.has(member.id)) {
                    // Safety catch if they somehow have an active session but aren't in a voice channel
                    handleUserVoiceState(member, stateToEvaluate, db);
                }
            }
        }
    });
}

function handleUserVoiceState(member, voiceState, db) {
    const userId = member.id;
    const valid = isUserValid(member, voiceState);
    
    console.log(`[VoiceRewards] Vérification de ${member.user.tag} : Valide = ${valid}`);

    if (valid) {
        if (pendingResets.has(userId)) {
            clearTimeout(pendingResets.get(userId));
            pendingResets.delete(userId);
            console.log(`[VoiceRewards] Timer d'annulation révoqué pour ${member.user.tag}`);
        }
        if (!activeSessions.has(userId)) {
            const now = Date.now();
            activeSessions.set(userId, { startTime: now, currentTier: 0 });
            db.saveVoiceSession(userId, now, 0).catch(console.error);
            console.log(`[VoiceRewards] Nouvelle session démarrée pour ${member.user.tag} (${userId})`);
        }
    } else {
        if (activeSessions.has(userId) && !pendingResets.has(userId)) {
            console.log(`[VoiceRewards] ${member.user.tag} n'est plus valide. Démarrage du timer d'annulation (30s)...`);
            startResetTimer(userId, db);
        }
    }
}

function startResetTimer(userId, db) {
    const timeout = setTimeout(async () => {
        console.log(`[VoiceRewards] Temps écoulé (30s) : Session supprimée pour ${userId}`);
        activeSessions.delete(userId);
        pendingResets.delete(userId);
        await db.deleteVoiceSession(userId).catch(console.error);
    }, 30000); // 30 seconds
    
    pendingResets.set(userId, timeout);
}

async function checkRewards(client, db) {
    const now = Date.now();
    
    // We do a full sweep to guarantee anyone active but not cached is caught,
    // and anyone who slipped through a bug is invalidated.
    for (const guild of client.guilds.cache.values()) {
        for (const channel of guild.channels.cache.values()) {
            if (!channel.isVoiceBased()) continue;
            for (const member of channel.members.values()) {
                if (member.user.bot) continue;
                handleUserVoiceState(member, member.voice, db);
            }
        }
    }

    for (const [userId, session] of activeSessions.entries()) {
        if (pendingResets.has(userId)) continue;
        
        // Final safety check: if we somehow bypassed the interval sweep, manually check valid state.
        if (!getMemberCurrentValidState(client, userId)) {
            if (!pendingResets.has(userId)) {
                startResetTimer(userId, db);
            }
            continue;
        }

        const minutes = Math.floor((now - session.startTime) / 60000);
        
        console.log(`[VoiceRewards] Check session: UID ${userId} | En cours depuis ${minutes} min | Tier actuel: ${session.currentTier}`);

        for (const tierDef of TIERS) {
            if (minutes >= tierDef.mins && tierDef.level > session.currentTier) {
                // Grant reward
                const coinsWon = Math.floor(Math.random() * (tierDef.maxCoins - tierDef.minCoins + 1)) + tierDef.minCoins;
                const tiragesWon = tierDef.tirages;

                try {
                    await db.updateBalance(userId, coinsWon, `Activité Vocale: ${tierDef.name}`);
                    if (tiragesWon > 0) {
                        await db.updateTirages(userId, tiragesWon);
                    }

                    session.currentTier = tierDef.level;
                    await db.updateVoiceSessionTier(userId, tierDef.level);
                    
                    console.log(`[VoiceRewards] 🏆 Récompense décernée à ${userId} pour le palier "${tierDef.name}"`);
                    announceReward(client, userId, tierDef, coinsWon, tiragesWon);
                } catch (err) {
                    console.error(`[VoiceRewards] Erreur récompense pour ${userId}:`, err);
                }
            }
        }
    }
}

async function announceReward(client, userId, tierDef, coins, tirages) {
    const channel = await client.channels.fetch(WINS_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    let desc = `<@${userId}> a atteint le palier **${tierDef.name}** en vocal ! Et à gagner `;
    
    if (tierDef.level === 5) {
        desc = `<@${userId}> vient d'atteindre le statut **Active Speaker** (2 Heures) !\n\n`;
    }

    desc += `**+ ${formatCoins(coins)} Coins**\n`;
    if (tirages > 0) {
        desc += `**+ ${tirages} Tirage${tirages > 1 ? 's' : ''}**`;
    }

    const embed = createEmbed(
        "Récompense Vocale",
        desc,
        COLORS.SUCCESS
    );

    // No emojis in the title/embed text, keeping it clean as requested
    await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { init };
