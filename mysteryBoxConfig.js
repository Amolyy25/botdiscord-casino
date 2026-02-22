// ═══════════════════════════════════════════════
// Mystery Box — Configuration des lots et probabilités
// ═══════════════════════════════════════════════

/**
 * Couleurs d'embed selon la rareté
 */
const RARITY_COLORS = {
  LEGENDAIRE: '#FFD700',   // Or brillant
  EPIQUE:     '#9B59B6',   // Violet épique
  RARE:       '#3498DB',   // Bleu rare
  COMMUN:     '#95A5A6',   // Gris commun
};

/**
 * Emojis selon la rareté
 */
const RARITY_EMOJIS = {
  LEGENDAIRE: '⭐',
  EPIQUE:     '💜',
  RARE:       '💙',
  COMMUN:     '⚪',
};

/**
 * Label affiché selon la rareté
 */
const RARITY_LABELS = {
  LEGENDAIRE: 'LÉGENDAIRE',
  EPIQUE:     'ÉPIQUE',
  RARE:       'RARE',
  COMMUN:     'COMMUN',
};

/**
 * Pool de lots de la Mystery Box.
 *
 * Chaque item :
 *   - id        : identifiant unique (utilisé en base)
 *   - name      : nom affiché
 *   - rarity    : LEGENDAIRE | EPIQUE | RARE | COMMUN
 *   - probability : chance (somme totale doit être ≈ 1.0)
 *   - type      : 'coins' | 'tirages' | 'role' | 'temp_role' | 'manual' | 'troll'
 *   - value     : montant/id selon le type
 *   - duration  : durée en ms (temp_role uniquement)
 *   - description : texte d'aide affiché dans l'embed de résultat
 *
 * PROBABILITÉS :
 *   Légendaire  ~3.01%
 *   Épique      ~10%
 *   Rare        ~25%
 *   Commun      ~61.99%
 */
const MYSTERY_BOX_ITEMS = [

  // ──────────────────────────────
  // ⭐ LÉGENDAIRE (~3.01%)
  // ──────────────────────────────
  {
    id: 'mb_nitro',
    name: 'Discord Nitro 1 mois',
    rarity: 'LEGENDAIRE',
    probability: 0.0001,   // 0.01% — distribué manuellement par un admin
    type: 'manual',
    value: 'NITRO',
    description: '🎮 Un mois de Discord Nitro ! Un admin te contactera pour te remettre ta récompense.',
  },
  {
    id: 'mb_coins_50k',
    name: '150 000 Coins',
    rarity: 'LEGENDAIRE',
    probability: 0.005,    // 0.5%
    type: 'coins',
    value: 150000,
    description: '🪙 Un trésor de **150 000 coins** déposé directement dans ton coffre !',
  },
  {
    id: 'mb_coins_25k',
    name: '85 000 Coins',
    rarity: 'LEGENDAIRE',
    probability: 0.01,     // 1%
    type: 'coins',
    value: 85000,
    description: '🪙 **85 000 coins** ! Le jackpot est pour toi.',
  },
  {
    id: 'mb_tirages_15',
    name: '50 Tirages',
    rarity: 'LEGENDAIRE',
    probability: 0.015,    // 1.5%
    type: 'tirages',
    value: 50,
    description: '🎫 **50 tirages** offerts ! Joue ta chance au maximum.',
  },

  // ──────────────────────────────
  // 💜 ÉPIQUE (~10%)
  // ──────────────────────────────
  {
    id: 'mb_coins_10k',
    name: '50 000 Coins',
    rarity: 'EPIQUE',
    probability: 0.03,     // 3%
    type: 'coins',
    value: 50000,
    description: '🪙 **50 000 coins** ! Une belle somme pour alimenter tes paris.',
  },
  {
    id: 'mb_coins_7k',
    name: '35 000 Coins',
    rarity: 'EPIQUE',
    probability: 0.04,     // 4%
    type: 'coins',
    value: 35000,
    description: '🪙 **35 000 coins** ajoutés à ton solde.',
  },
  {
    id: 'mb_tirages_10',
    name: '20 Tirages',
    rarity: 'EPIQUE',
    probability: 0.03,     // 3%
    type: 'tirages',
    value: 20,
    description: '🎫 **20 tirages** offerts ! Teste ta chance.',
  },

  // ──────────────────────────────
  // 💙 RARE (~25%)
  // ──────────────────────────────
  {
    id: 'mb_coins_5k',
    name: '20 000 Coins',
    rarity: 'RARE',
    probability: 0.08,     // 8%
    type: 'coins',
    value: 20000,
    description: '🪙 **20 000 coins** ! Pas mal du tout.',
  },
  {
    id: 'mb_coins_3k',
    name: '10 000 Coins',
    rarity: 'RARE',
    probability: 0.10,     // 10%
    type: 'coins',
    value: 10000,
    description: '🪙 **10 000 coins** de plus dans ta poche.',
  },
  {
    id: 'mb_tirages_5',
    name: '10 Tirages',
    rarity: 'RARE',
    probability: 0.07,     // 7%
    type: 'tirages',
    value: 10,
    description: '🎫 **10 tirages** gratuits.',
  },

  // ──────────────────────────────
  // ⚪ COMMUN (~61.99%)
  // ──────────────────────────────
  {
    id: 'mb_coins_1k',
    name: '5 000 Coins',
    rarity: 'COMMUN',
    probability: 0.15,     // 15%
    type: 'coins',
    value: 5000,
    description: '🪙 **5 000 coins**. C\'est toujours ça de pris !',
  },
  {
    id: 'mb_coins_500',
    name: '2 500 Coins',
    rarity: 'COMMUN',
    probability: 0.20,     // 20%
    type: 'coins',
    value: 2500,
    description: '🪙 **2 500 coins** trouvés au fond de la boîte.',
  },
  {
    id: 'mb_tirages_2',
    name: '5 Tirages',
    rarity: 'COMMUN',
    probability: 0.10,     // 10%
    type: 'tirages',
    value: 5,
    description: '🎫 **5 tirages** ! C\'est mieux que rien.',
  },
  {
    id: 'mb_troll_poignee',
    name: 'Une poignée de main virtuelle',
    rarity: 'COMMUN',
    probability: 0.05,     // 5%
    type: 'troll',
    value: null,
    description: '🤝 Félicitations... tu as reçu **une poignée de main virtuelle**. Spectaculaire.',
  },
  {
    id: 'mb_troll_encouragement',
    name: 'Des encouragements',
    rarity: 'COMMUN',
    probability: 0.05,     // 5%
    type: 'troll',
    value: null,
    description: '💬 La boîte te dit : **"T\'aurais dû prendre la récompense de base."**',
  },
  {
    id: 'mb_coins_200',
    name: '1 000 Coins',
    rarity: 'COMMUN',
    probability: 0.1699,   // ~16.99% — padding pour atteindre 100%
    type: 'coins',
    value: 1000,
    description: '🪙 **1 000 coins**. La boîte était presque vide, mais bon...',
  },
];

// Validation (dev safety check)
const totalProb = MYSTERY_BOX_ITEMS.reduce((s, i) => s + i.probability, 0);
if (Math.abs(totalProb - 1.0) > 0.001) {
  console.warn(`[MysteryBox] ⚠️ Probabilités = ${totalProb.toFixed(4)} (attendu ≈ 1.0)`);
}

/**
 * Tire aléatoirement un lot selon les probabilités pondérées.
 * @returns {Object} L'item tiré
 */
function drawMysteryItem() {
  const random = Math.random();
  let cumulative = 0;
  for (const item of MYSTERY_BOX_ITEMS) {
    cumulative += item.probability;
    if (random <= cumulative) return item;
  }
  return MYSTERY_BOX_ITEMS[MYSTERY_BOX_ITEMS.length - 1];
}

/**
 * Renvoie tous les items d'une rareté donnée.
 * @param {string} rarity
 */
function getItemsByRarity(rarity) {
  return MYSTERY_BOX_ITEMS.filter(i => i.rarity === rarity);
}


module.exports = {
  MYSTERY_BOX_ITEMS,
  RARITY_COLORS,
  RARITY_EMOJIS,
  RARITY_LABELS,
  drawMysteryItem,
  getItemsByRarity,
};
