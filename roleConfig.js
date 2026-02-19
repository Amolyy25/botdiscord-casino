const CASINO_CATEGORY_ID = '1469071692172361836';
const CASINO_CHANNEL_ID = '1469071692348264634';
const WINS_CHANNEL_ID = '1469719884249301176';

// Role IDs and their probabilities
// Scaling down roles by ~0.8 to make room for coins
const ROLE_POOL = [
    // ULTRA RARE (1% total) - Increased from 0.5%
    { type: 'role', id: '1473736462892794008', name: 'Nébuleuse', probability: 0.002, color: '#9B59B6' },
    { type: 'role', id: '1473736527225028689', name: 'Horizon', probability: 0.002, color: '#3498DB' },
    { type: 'coins', amount: 20000, name: '20 000 Coins', probability: 0.002, color: '#FFD700' },
    { type: 'extra_tirages', amount: 10, name: 'Tirage x10', probability: 0.002, color: '#FFD700' },
    { type: 'role', id: '1470931333760155854', name: 'Boost XP x2', probability: 0.002, color: '#FF0000' },

    // RARE (4.8% total) - Now contains +5000 and x5
    { type: 'role', id: '1473736411135086613', name: 'Legende Urbaine', probability: 0.008, color: '#E67E22' },
    { type: 'role', id: '1473734399328780513', name: 'Pilier secteur', probability: 0.008, color: '#E67E22' },
    { type: 'role', id: '1473736166866948321', name: 'Maitre du hasard', probability: 0.008, color: '#E67E22' },
    { type: 'role', id: '1473736298945577175', name: 'Éminence grise', probability: 0.008, color: '#E67E22' },
    { type: 'coins', amount: 10000, name: '10000 Coins', probability: 0.008, color: '#FFD700' },
    { type: 'extra_tirages', amount: 5, name: 'Tirage x5', probability: 0.008, color: '#FFD700' },
    { type: 'role', id: '1470934696085946561', name: 'Immunité 24H', probability: 0.005, color: '#FFD700', duration: 24 * 60 * 60 * 1000 },

    // MOYEN RARE (10% total) - Now contains +2000, x3 and XP x1.5
    { type: 'role', id: '1473734498318417991', name: 'DEMON DÉGUISÉ', probability: 0.02, color: '#E74C3C' },
    { type: 'coins', amount: 5000, name: '5000 Coins', probability: 0.02, color: '#FFD700' },
    { type: 'extra_tirages', amount: 3, name: 'Tirage x3', probability: 0.02, color: '#FFD700' },
    { type: 'role', id: '1470934642998644826', name: 'Immunité 6H', probability: 0.01, color: '#C0C0C0', duration: 6 * 60 * 60 * 1000 },
    { type: 'role', id: '1470934040692392008', name: 'Immunité 2H', probability: 0.02, color: '#CD7F32', duration: 2 * 60 * 60 * 1000 },
    { type: 'role', id: '1470931245381845216', name: 'Boost XP x1.5', probability: 0.01, color: '#FFA500' },

    // COMMUN / PEU COMMUN (Remaining 84.2%)
    { type: 'role', id: '1469071689831940302', name: 'Blanc', probability: 0.015, color: '#FFFFFF' },
    { type: 'role', id: '1469071689831940301', name: 'Violet', probability: 0.03, color: '#9B59B6' },
    { type: 'role', id: '1469071689823289446', name: 'Noir', probability: 0.015, color: '#000000' },
    { type: 'role', id: '1469071689823289445', name: 'Cyan', probability: 0.03, color: '#00FFFF' },
    { type: 'role', id: '1469071689823289444', name: 'Jaune', probability: 0.05, color: '#FFFF00' },
    { type: 'role', id: '1469071689823289443', name: 'Rouge foncé', probability: 0.04, color: '#8B0000' },
    { type: 'role', id: '1469071689823289442', name: 'Rouge Claire', probability: 0.04, color: '#FF6B6B' },
    { type: 'role', id: '1469071689823289441', name: 'Orange', probability: 0.05, color: '#FFA500' },
    { type: 'role', id: '1469071689823289440', name: 'Vert foncé', probability: 0.05, color: '#006400' },
    { type: 'role', id: '1469071689823289439', name: 'Vert Claire', probability: 0.05, color: '#90EE90' },
    { type: 'role', id: '1469071689823289438', name: 'Bleu foncé', probability: 0.11, color: '#00008B' },
    { type: 'role', id: '1469071689823289437', name: 'Bleu Claire', probability: 0.11, color: '#87CEEB' },
    { type: 'coins', amount: 500, name: '500 Coins', probability: 0.207, color: '#FFD700' },
    { type: 'coins', amount: 1000, name: '1000 Coins', probability: 0.04, color: '#FFD700' }
];

// Special role IDs for weekly tirages
const BOOSTER_ROLE_ID = '1469071689399926791'; // 1 tirage per week
const PREMIUM_ROLE_ID = '1469314101615398995'; // 2 tirages per week

function drawRole() {
    const random = Math.random();
    let cumulative = 0;
    
    for (const role of ROLE_POOL) {
        cumulative += role.probability;
        if (random <= cumulative) {
            return role;
        }
    }
    
    // Fallback to last item if something goes wrong
    return ROLE_POOL[ROLE_POOL.length - 1];
}

module.exports = {
    CASINO_CATEGORY_ID,
    CASINO_CHANNEL_ID,
    WINS_CHANNEL_ID,
    ROLE_POOL,
    BOOSTER_ROLE_ID,
    PREMIUM_ROLE_ID,
    drawRole
};
