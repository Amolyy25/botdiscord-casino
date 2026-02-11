const CASINO_CATEGORY_ID = '1469071692172361836';
const CASINO_CHANNEL_ID = '1469071692348264634';
const WINS_CHANNEL_ID = '1469719884249301176';

// Role IDs and their probabilities
// Scaling down roles by ~0.8 to make room for coins
const ROLE_POOL = [
    // Roles
    { type: 'role', id: '1470931333760155854', name: 'Boost XP x2', probability: 0.0002, color: '#FF0000' },
    { type: 'role', id: '1470931245381845216', name: 'Boost XP x1.5', probability: 0.0008, color: '#FFA500' },
    { type: 'role', id: '1470934696085946561', name: 'Immunité 24H', probability: 0.02, color: '#FFD700', duration: 24 * 60 * 60 * 1000 },
    { type: 'role', id: '1470934642998644826', name: 'Immunité 6H', probability: 0.05, color: '#C0C0C0', duration: 6 * 60 * 60 * 1000 },
    { type: 'role', id: '1470934040692392008', name: 'Immunité 2H', probability: 0.10, color: '#CD7F32', duration: 2 * 60 * 60 * 1000 },
    { type: 'role', id: '1469071689831940302', name: 'Blanc', probability: 0.0004, color: '#FFFFFF' },
    { type: 'role', id: '1469071689831940301', name: 'Violet', probability: 0.008, color: '#9B59B6' },
    { type: 'role', id: '1469071689823289446', name: 'Noir', probability: 0.004, color: '#000000' },
    { type: 'role', id: '1469071689823289445', name: 'Cyan', probability: 0.016, color: '#00FFFF' },
    { type: 'role', id: '1469071689823289444', name: 'Jaune', probability: 0.08, color: '#FFFF00' },
    { type: 'role', id: '1469071689823289443', name: 'Rouge foncé', probability: 0.04, color: '#8B0000' },
    { type: 'role', id: '1469071689823289442', name: 'Rouge Claire', probability: 0.04, color: '#FF6B6B' },
    { type: 'role', id: '1469071689823289441', name: 'Orange', probability: 0.08, color: '#FFA500' },
    { type: 'role', id: '1469071689823289440', name: 'Vert foncé', probability: 0.08, color: '#006400' },
    { type: 'role', id: '1469071689823289439', name: 'Vert Claire', probability: 0.08, color: '#90EE90' },
    { type: 'role', id: '1469071689823289438', name: 'Bleu foncé', probability: 0.1858, color: '#00008B' },
    { type: 'role', id: '1469071689823289437', name: 'Bleu Claire', probability: 0.1858, color: '#87CEEB' },
    
    // Coins
    { type: 'coins', amount: 500, name: '500 Coins', probability: 0.14, color: '#FFD700' },
    { type: 'coins', amount: 1000, name: '1000 Coins', probability: 0.05, color: '#FFD700' },
    { type: 'coins', amount: 5000, name: '5000 Coins', probability: 0.01, color: '#FFD700' }
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
