const fs = require('fs');
const path = require('path');
const { createEmbed, formatCoins } = require('../utils');
const { WINS_CHANNEL_ID } = require('../roleConfig');

const ACHIEVEMENTS_FILE = path.join(__dirname, '../succes.json');
let achievementsConfig = [];

// Load config
try {
    const data = JSON.parse(fs.readFileSync(ACHIEVEMENTS_FILE, 'utf-8'));
    achievementsConfig = data.achievements || [];
} catch (e) {
    console.error('[Achievements] Erreur lors du chargement de succes.json:', e);
}

const ACHIEVEMENT_COLORS = {
    MONOCHROME: '#FFFFFF'
};

class AchievementsHelper {
    
    constructor() {
        this.cache = new Map(); // For temporary flags like RISK_03
    }
    
    getAchievementDef(id) {
        return achievementsConfig.find(a => a.id === id);
    }

    /**
     * Main entry point to trigger an event evaluation
     * @param {Object} client - Discord client
     * @param {Object} db - Database module
     * @param {String} userId - The user ID
     * @param {String} eventType - The type of event ('CAPITAL', 'RISK', 'RESILIENCE', 'DRAW', 'SOCIAL')
     * @param {Object} data - Contextual data for the event
     */
    async triggerEvent(client, db, userId, eventType, data) {
        try {
            const user = await db.getUser(userId);
            if (!user) return;
            
            // Initialize user data if null
            let achievements = user.achievements || {};
            let stats = user.stats_trackers || {};
            let updateNeeded = false;

            // Common variables
            const balance = BigInt(user.balance);

            if (eventType === 'CAPITAL') {
                updateNeeded = await this.checkCapital(client, db, userId, balance, achievements);
            } else if (eventType === 'RISK') {
                updateNeeded = await this.checkRisk(client, db, userId, data, balance, achievements, stats);
            } else if (eventType === 'RESILIENCE') {
                updateNeeded = await this.checkResilience(client, db, userId, data, balance, achievements, stats);
            } else if (eventType === 'SOCIAL') {
                updateNeeded = await this.checkSocial(client, db, userId, data, achievements, stats);
            } else if (eventType === 'DRAW') {
                updateNeeded = await this.checkDraw(client, db, userId, data, achievements, stats);
            }

            if (updateNeeded) {
                await db.updateAchievements(userId, achievements);
                await db.updateStatsTrackers(userId, stats);
            }
        } catch (e) {
            console.error(`[Achievements] Erreur lors du trigger de l'event ${eventType} pour ${userId}:`, e);
        }
    }

    // A. Catégorie : Capital & Puissance
    async checkCapital(client, db, userId, balance, achievements) {
        let unlockedAny = false;
        const capChecks = [
            { id: 'CAP_01', required: 10000n },
            { id: 'CAP_02', required: 100000n },
            { id: 'CAP_03', required: 1000000n },
            { id: 'CAP_04', required: 10000000n },
            { id: 'CAP_05', required: 50000000n },
            { id: 'CAP_06', required: 100000000n },
            { id: 'CAP_07', required: 1000000000n }
        ];

        for (const check of capChecks) {
            if (!achievements[check.id] && balance >= check.required) {
                await this.grantAchievement(client, db, userId, check.id, achievements);
                unlockedAny = true;
            }
        }
        return unlockedAny;
    }

    // A. Catégorie : Prise de Risque
    async checkRisk(client, db, userId, data, balance, achievements, stats) {
        let unlockedAny = false;
        stats.total_bets_24h = stats.total_bets_24h || [];
        stats.total_bets_24h = stats.total_bets_24h.filter(ts => Date.now() - ts < 86400000);
        stats.total_bets_24h.push(Date.now());
        
        const { bet, outcome, winChance, potentialWin, isJackpot } = data;
        const win = outcome === 'win';
        const isAllIn = bet >= balance; // Note: In most games, balance is checked BEFORE bet is deducted, or AFTER. This logic assumes bet == total balance BEFORE deduction.
        
        // RISK_01: All-In et gagner
        if (!achievements['RISK_01'] && isAllIn && win) {
            await this.grantAchievement(client, db, userId, 'RISK_01', achievements);
            unlockedAny = true;
        }

        // RISK_02: Pari unique > 5 000 000
        if (!achievements['RISK_02'] && bet > 5000000n) {
            await this.grantAchievement(client, db, userId, 'RISK_02', achievements);
            unlockedAny = true;
        }

        // RISK_03: Tapis Noir (3 All-In victorieux de suite)
        if (!achievements['RISK_03']) {
            if (isAllIn && win) {
                stats.consecutive_all_ins = (stats.consecutive_all_ins || 0) + 1;
                unlockedAny = true; // Update stat in DB
                if (stats.consecutive_all_ins >= 3) {
                    await this.grantAchievement(client, db, userId, 'RISK_03', achievements);
                }
            } else if (stats.consecutive_all_ins > 0) {
                stats.consecutive_all_ins = 0;
                unlockedAny = true; // Update stat in DB
            }
        }

        // RISK_04: Main d'Acier (>50% du solde, <30% chance win)
        if (!achievements['RISK_04'] && bet >= (balance / 2n) && winChance < 0.30) {
            await this.grantAchievement(client, db, userId, 'RISK_04', achievements);
            unlockedAny = true;
        }

        // RISK_06: Insatiable (Reparier instantanément la totalité d'un gain venant d'être empoché)
        // Check if previous action was a win with the same profit amount. We use a short cache.
        const lastWinKey = `last_win_${userId}`;
        const lastWin = this.cache.get(lastWinKey);
        if (!achievements['RISK_06'] && lastWin && lastWin.amount === bet && (Date.now() - lastWin.timestamp < 60000)) {
            await this.grantAchievement(client, db, userId, 'RISK_06', achievements);
            unlockedAny = true;
        }
        
        // Store current result in cache for Insatiable
        if (win && potentialWin) {
            this.cache.set(lastWinKey, { amount: potentialWin, timestamp: Date.now() });
        } else {
            this.cache.delete(lastWinKey);
        }

        // RISK_07: Adrénaline (Pari > 90% capital ET capital > 1M)
        if (!achievements['RISK_07'] && balance > 1000000n && bet >= (balance * 90n / 100n)) {
            await this.grantAchievement(client, db, userId, 'RISK_07', achievements);
            unlockedAny = true;
        }

        // RISK_08: Le Pari des 100 (100 paris terminés en moins de 24h)
        if (!achievements['RISK_08'] && stats.total_bets_24h.length >= 100) {
            await this.grantAchievement(client, db, userId, 'RISK_08', achievements);
            unlockedAny = true;
        }

        // RISK_10: Coup de Poker (Gain > 5x la mise ET mise > 1M ET victoire)
        if (!achievements['RISK_10'] && win && bet > 1000000n && potentialWin && potentialWin >= (bet * 5n)) {
            await this.grantAchievement(client, db, userId, 'RISK_10', achievements);
            unlockedAny = true;
        }

        return unlockedAny || true; // True because stats are updated
    }

    // B. Catégorie : Résilience (Tracking Historique)
    async checkResilience(client, db, userId, data, balance, achievements, stats) {
        let unlockedAny = false;
        const { bet, outcome, winChance, newBalance } = data;
        const win = outcome === 'win';

        // RES_01: Zéro Absolu (Perdre l'intégralité, min 50k, sur un pari raté)
        if (!achievements['RES_01'] && !win && newBalance === 0n && bet >= 50000n) {
            await this.grantAchievement(client, db, userId, 'RES_01', achievements);
            unlockedAny = true;
        }

        // RES_02: L'Infortuné (Perdre avec proba gain >= 90%)
        if (!achievements['RES_02'] && !win && winChance >= 0.90) {
            await this.grantAchievement(client, db, userId, 'RES_02', achievements);
            unlockedAny = true;
        }

        // RES_03: Phénix (Flag à 0, puis >= 1M sans social transfer)
        if (!achievements['RES_03']) {
            if (newBalance === 0n) {
                stats.phenix_flag = true;
                stats.phenix_social_help = false;
            } else if (stats.phenix_flag && newBalance >= 1000000n) {
                if (!stats.phenix_social_help) {
                    await this.grantAchievement(client, db, userId, 'RES_03', achievements);
                    unlockedAny = true;
                }
                // Reset flag
                stats.phenix_flag = false;
            }
        }

        return unlockedAny || true; // Stats might have changed
    }

    // C. Catégorie : Flux & Social
    async checkSocial(client, db, userId, data, achievements, stats) {
        let unlockedAny = false;
        const { amount, action, targetId } = data; // action = 'send' or 'receive'
        
        if (action === 'send') {
            // Anti-farming check (A sends to B, B sends to A)
            // Note: Simplification for now, we just track amount sent.
            
            // RES_04: Mécène (Transférer plus de 5M)
            if (!achievements['RES_04'] && amount > 5000000n) {
                await this.grantAchievement(client, db, userId, 'RES_04', achievements);
                unlockedAny = true;
            }

            // RES_06: Le Pivot (Expéditeur transaction > 10M)
            if (!achievements['RES_06'] && amount > 10000000n) {
                await this.grantAchievement(client, db, userId, 'RES_06', achievements);
                unlockedAny = true;
            }
        } 
        
        if (action === 'receive') {
            // If user receives money, cancel Phenix challenge
            if (!achievements['RES_03'] && stats.phenix_flag) {
                stats.phenix_social_help = true;
                unlockedAny = true; // Update needed
            }
        }

        // RES_05: Négociant (Achat d'un rôle dans le shop)
        if (action === 'shop_role_purchase') {
            if (!achievements['RES_05']) {
                await this.grantAchievement(client, db, userId, 'RES_05', achievements);
                unlockedAny = true;
            }
        }

        return unlockedAny;
    }

    // D. Catégorie : Tirages
    async checkDraw(client, db, userId, data, achievements, stats) {
        let unlockedAny = false;
        const { drawCount, winMultiplier, isMaxTier, durationMS } = data;

        // DRAW_01: Premier tirage
        if (!achievements['DRAW_01']) {
            await this.grantAchievement(client, db, userId, 'DRAW_01', achievements);
            unlockedAny = true;
        }

        // DRAW_02: Série de 10 tirages à la suite 
        // We'll track total consecutive draws in a short timeframe
        stats.recent_draws = stats.recent_draws || [];
        stats.recent_draws = stats.recent_draws.filter(ts => Date.now() - ts < 300000); // 5 mins
        for(let i=0; i<drawCount; i++) stats.recent_draws.push(Date.now());

        if (!achievements['DRAW_02'] && stats.recent_draws.length >= 10) {
            await this.grantAchievement(client, db, userId, 'DRAW_02', achievements);
            unlockedAny = true;
        }

        // DRAW_05: Tireur d'élite (Gain > 10x la mise du tirage)
        if (!achievements['DRAW_05'] && winMultiplier && winMultiplier > 10) {
            await this.grantAchievement(client, db, userId, 'DRAW_05', achievements);
            unlockedAny = true;
        }
        
        // DRAW_06: Frénésie (10 tirages en moins de 60s)
        const draws60s = stats.recent_draws.filter(ts => Date.now() - ts < 60000);
        if (!achievements['DRAW_06'] && draws60s.length >= 10) {
            await this.grantAchievement(client, db, userId, 'DRAW_06', achievements);
            unlockedAny = true;
        }

        // DRAW_07: Le Grand Tirage (Débloquer et utiliser le palier de tirage le plus coûteux)
        if (!achievements['DRAW_07'] && isMaxTier) {
            await this.grantAchievement(client, db, userId, 'DRAW_07', achievements);
            unlockedAny = true;
        }

        return unlockedAny || true; // Stats updated
    }


    /**
     * Accorde un succès à un utilisateur, donne la récompense et envoie l'embed
     */
    async grantAchievement(client, db, userId, achievementId, achievementsObj) {
        const def = this.getAchievementDef(achievementId);
        if (!def) return;

        // Mark as unlocked
        achievementsObj[achievementId] = true;

        // Rewards
        if (def.reward) {
            if (def.reward.coins > 0) {
                await db.updateBalance(userId, def.reward.coins, `Succès débloqué : ${def.name}`);
            }
            if (def.reward.tirages > 0) {
                await db.updateTirages(userId, def.reward.tirages);
            }
        }

        // Notification in CASINO_WIN
        try {
            const channel = await client.channels.fetch(WINS_CHANNEL_ID).catch(() => null);
            if (!channel) return;

            const userOrMember = await client.users.fetch(userId).catch(() => null);
            const username = userOrMember ? userOrMember.username : `<@${userId}>`;

            // Style Monochrome
            const embed = createEmbed(
                `Nouveau succès pour ${username}`,
                ' ', // Minimum length of 1 character required by discord.js
                ACHIEVEMENT_COLORS.MONOCHROME
            );
            
            // Fields specified in requirements
            embed.addFields([
                { name: 'Succès :', value: `**${def.name}**`, inline: false },
                { name: 'Description :', value: `*${def.description}*`, inline: false }
            ]);

            let rewardStr = [];
            if (def.reward.coins > 0) rewardStr.push(`+${formatCoins(def.reward.coins)}`);
            if (def.reward.tirages > 0) rewardStr.push(`+${def.reward.tirages} Tirages`);
            
            if (rewardStr.length > 0) {
                embed.addFields([{ name: 'Récompense :', value: `**${rewardStr.join(' / ')}**`, inline: false }]);
            }

            if (userOrMember) {
                embed.setThumbnail(userOrMember.displayAvatarURL({ dynamic: true }));
            }

            await channel.send({ embeds: [embed] });

        } catch (e) {
            console.error(`[Achievements] Impossible d'envoyer la notification pour ${userId}:`, e);
        }
    }
}

module.exports = new AchievementsHelper();
