/**
 * Configuration du système de Prestige
 * Définit les paliers, les prix, les récompenses et les rôles associés.
 */

const PRESTIGE_LEVELS = [
    {
        level: 1,
        name: "PRESTIGE I",
        price: 1000000,
        collectReward: 300,
        gainMultiplier: 0.01, // +1% de gains
        tirageReward: 5,
        roleId: "1474327592709656709",
        rewards: [
            "Commande ;collect passe à 300 coins",
            "+1% de gains au casino",
            "+5 Tirages (Ticket)",
            "Rôle exclusif PRESTIGE I"
        ]
    },
    {
        level: 2,
        name: "PRESTIGE II",
        price: 7500000,
        collectReward: 1000,
        gainMultiplier: 0.03, // +3%
        tirageReward: 8,
        roleId: "1474327677929259058",
        rewards: [
            "Commande ;collect passe à 1 000 coins",
            "+3% de gains au casino",
            "+8 Tirages (Ticket)",
            "Rôle exclusif PRESTIGE II"
        ]
    },
    {
        level: 3,
        name: "PRESTIGE III",
        price: 25000000,
        collectReward: 5000,
        gainMultiplier: 0.06, // +6%
        tirageReward: 15,
        roleId: "1474327696493252689",
        rewards: [
            "Commande ;collect passe à 5 000 coins",
            "+6% de gains au casino",
            "+15 Tirages (Ticket)",
            "Rôle exclusif PRESTIGE III"
        ]
    },
    {
        level: 4,
        name: "PRESTIGE IV",
        price: 75000000,
        collectReward: 15000,
        gainMultiplier: 0.09, // +9%
        tirageReward: 25,
        roleId: "1474327719251542077",
        rewards: [
            "Commande ;collect passe à 15 000 coins",
            "+9% de gains au casino",
            "+25 Tirages (Ticket)",
            "Rôle exclusif PRESTIGE IV"
        ]
    },
    {
        level: 5,
        name: "PRESTIGE V",
        price: 200000000,
        collectReward: 50000,
        gainMultiplier: 0.12, // +12%
        tirageReward: 40,
        roleId: "1474327739816345651",
        rewards: [
            "Commande ;collect passe à 50 000 coins",
            "+12% de gains au casino",
            "+40 Tirages (Ticket)",
            "Rôle exclusif PRESTIGE V"
        ]
    },
    {
        level: 6,
        name: "PRESTIGE VI",
        price: 1000000000,
        collectReward: 50000,
        gainMultiplier: 0.17, // +17%
        tirageReward: 60,
        roleId: "1479485016080646295",
        rewards: [
            "+17% de gains au casino",
            "+60 Tirages (Ticket)",
            "Rôle exclusif PRESTIGE VI"
        ]
    },
    {
        level: 7,
        name: "PRESTIGE VII",
        price: 100000000000, // 100B
        collectReward: 100000,
        gainMultiplier: 0.17,
        tirageReward: 30,
        roleId: "1479485042290851972",
        rewards: [
            "Commande ;collect passe à 100 000 coins",
            "Débloque la commande ;taxe (3% de la cible)",
            "+30 Tirages (Ticket)",
            "Rôle exclusif PRESTIGE VII"
        ]
    },
    {
        level: 8,
        name: "PRESTIGE VIII",
        price: 500000000000, // 500B
        collectReward: 500000,
        gainMultiplier: 0.21, // +21%
        tirageReward: 30,
        roleId: "1479485055175757987",
        rewards: [
            "Commande ;collect passe à 500 000 coins",
            "+21% de gains au casino",
            "Amélioration de ;taxe (4% de la cible)",
            "+30 Tirages (Ticket)",
            "Rôle exclusif PRESTIGE VIII"
        ]
    }
];

/**
 * Récupère les bénéfices basés sur le niveau de prestige actuel
 * @param {number} level 
 */
function getPrestigeBenefits(level) {
    if (level <= 0) return { collectReward: 150, gainMultiplier: 0 };
    const config = PRESTIGE_LEVELS.find(p => p.level === level);
    if (!config) {
        const last = PRESTIGE_LEVELS[PRESTIGE_LEVELS.length - 1];
        if (level > last.level) return last;
        return { collectReward: 150, gainMultiplier: 0 };
    }
    return config;
}

/**
 * Applique le bonus de prestige sur un gain
 * @param {bigint} profit 
 * @param {number} level 
 */
function applyPrestigeBonus(profit, level) {
    if (level <= 0) return profit;
    const benefits = getPrestigeBenefits(level);
    if (benefits.gainMultiplier <= 0) return profit;
    
    // Ajout du pourcentage (ex: 3% -> profit * 103 / 100)
    const multiplier = BigInt(Math.floor(benefits.gainMultiplier * 100));
    return profit + (profit * multiplier / 100n);
}

const PRESTIGE_REQUIREMENTS = {
    6: {
        roleId: '1474149732124463379',
        roleName: 'SPECTRE D\'OR',
        games: { roulette: 100, blackjack: 100 }
    },
    7: {
        activity: 1500,
        games: { coinflip: 1000, braquage: 3 }
    },
    8: {
        roleId: '1473734999608918077',
        roleName: 'BRAS DROIT',
        games: { braquage: 5, mines: 200, towers: 200 }
    }
};

async function checkPrestigeRequirements(level, userId, member, db) {
    const reqs = PRESTIGE_REQUIREMENTS[level];
    if (!reqs) return { hasRequirements: true, details: [] }; // No specific advanced requirements

    let hasRequirements = true;
    const details = [];

    // 1. Role Check
    if (reqs.roleId) {
        const hasRole = member.roles.cache.has(reqs.roleId);
        if (!hasRole) hasRequirements = false;
        details.push({
            name: 'Vocal',
            text: `Rôle ${reqs.roleName}`,
            passed: hasRole
        });
    }

    // 2. Activity Check
    if (reqs.activity) {
        const msgCount = await db.getMessageCount(userId);
        const passed = msgCount >= reqs.activity;
        if (!passed) hasRequirements = false;
        details.push({
            name: 'Activité',
            text: `${msgCount} / ${reqs.activity} messages (14j)`,
            passed: passed
        });
    }

    // 3. Games Check
    if (reqs.games) {
        const wins = await db.getGameWins(userId);
        for (const [game, requiredAmount] of Object.entries(reqs.games)) {
            const userWins = parseInt(wins[game] || 0);
            const passed = userWins >= requiredAmount;
            if (!passed) hasRequirements = false;
            
            const gameNames = {
                roulette: 'Roulette',
                blackjack: 'Blackjack',
                coinflip: 'Coinflip',
                braquage: 'Braquage',
                mines: 'Mines',
                towers: 'Towers'
            };

            details.push({
                name: `Jeux (${gameNames[game]})`,
                text: `${userWins} / ${requiredAmount} victoires`,
                passed: passed
            });
        }
    }

    return { hasRequirements, details };
}

module.exports = {
    PRESTIGE_LEVELS,
    getPrestigeBenefits,
    applyPrestigeBonus,
    checkPrestigeRequirements,
    PRESTIGE_REQUIREMENTS
};

