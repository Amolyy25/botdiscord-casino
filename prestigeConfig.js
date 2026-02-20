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

module.exports = {
    PRESTIGE_LEVELS,
    getPrestigeBenefits,
    applyPrestigeBonus
};
