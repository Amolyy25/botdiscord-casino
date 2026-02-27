# Contexte du jeu Crash

Documentation du jeu Crash (`commands/crash.js`) : fonctionnement, dépendances externes, flux d'exécution et intégrations.

---

## Vue d'ensemble

Le **Crash** est un jeu de casino où le joueur mise des coins. Un multiplicateur démarre à 1.0x et augmente de 0.1x chaque seconde. Le joueur peut encaisser (Cash Out) à tout moment pour gagner `mise × multiplicateur`. Le multiplicateur "crash" à un point aléatoire prédéterminé : si le joueur n’a pas encaissé avant, il perd sa mise.

**Commande :** `;crash [mise/all]`

---

## Dépendances externes

### 1. `discord.js`

| Import | Usage |
|--------|-------|
| `ActionRowBuilder` | Construction de la rangée de boutons |
| `ButtonBuilder` | Bouton "CASH OUT" |
| `ButtonStyle` | Style visuel du bouton (Danger = rouge) |
| `ComponentType` | Importé mais non utilisé directement |

### 2. `../utils` (`utils.js`)

| Export | Usage |
|--------|-------|
| `createEmbed(title, description, color)` | Création des embeds Discord |
| `COLORS` | PRIMARY, SUCCESS, ERROR, GOLD pour les couleurs d’embed |
| `parseBet(args[0], user.balance)` | Parse la mise (`all` = tout le solde, sinon nombre) → retourne `BigInt` ou `null` |
| `formatCoins(amount)` | Formate un montant en "**X** coins 🪙" pour l’affichage |

### 3. `../events/eventsManager`

| Méthode | Usage |
|---------|-------|
| `getGloryHourStatus()` | Retourne `{ text, active }` pour l’Heure de Gloire (gains doublés) |
| `isDoubleGainActive()` | Indique si les gains sont doublés |

Si l’Heure de Gloire est active, le profit du joueur est multiplié par 2 lors du cashout.

### 4. `../roleConfig`

| Export | Usage |
|--------|-------|
| `WINS_CHANNEL_ID` | ID du salon où sont annoncés les gros gains (500+ coins de profit) |

Importé dynamiquement uniquement lors d’un gros gain, pour limiter les requêtes Discord.

### 5. `db` (base de données, `database.js`)

| Méthode | Usage |
|---------|-------|
| `getUser(id)` | Récupère l’utilisateur (créé si absent) avec `balance` |
| `updateBalance(id, amount)` | Met à jour le solde (ajoute `amount`, peut être négatif) |

---

## Point d’entrée et exécution

Le jeu est exécuté via :

```
messageCreate (bot.js)
  → args = message.content.split(...)
  → command = client.commands.get('crash')
  → command.execute(message, args, db)
```

Le bot charge tous les fichiers de `commands/` et enregistre ceux qui exportent `name` et `execute`.

---

## Flux du jeu (étape par étape)

### 1. Validation et préparation

1. **Partie déjà en cours**  
   Si `activeGames.has(message.author.id)` → erreur "Vous avez déjà une partie en cours".

2. **Récupération utilisateur**  
   `db.getUser(message.author.id)` pour obtenir le solde.

3. **Parsing de la mise**  
   `parseBet(args[0], user.balance)`  
   - `"all"` → mise = solde  
   - Sinon → mise = `BigInt(args[0])` ou `null` si invalide  

4. **Vérifications**  
   - Mise invalide → usage  
   - Solde &lt; mise → erreur solde insuffisant  

5. **Débit immédiat**  
   `db.updateBalance(message.author.id, -bet)`  
   La mise est déduite au début pour éviter les "free rolls" en cas de crash du bot.

6. **Ajout à activeGames**  
   `activeGames.add(message.author.id)` pour bloquer une seconde partie.

### 2. Calcul du crash

```javascript
crashPoint = Math.max(1.1, (100 / (Math.random() * 100)).toFixed(2))
```

- `Math.random() * 100` ∈ ]0, 100[
- `100 / x` → valeur &gt; 1
- Minimum 1.1x, le crash peut être très élevé (ex. 100x).

### 3. Interface et collecteur

- **Bouton**  
  `customId = crash_cashout_${message.id}` (unique par partie pour éviter les doublons).

- **Collector**  
  `msg.createMessageComponentCollector({ filter, time: 60000 })`  
  - Filtre : même utilisateur et bon `customId`.  
  - Timeout : 60 secondes (le multiplicateur peut monter jusqu’à 6.0x avant timeout).

### 4. Boucle `setInterval` (toutes les 1 seconde)

1. Si `cashedOut` → retour immédiat.
2. `currentMultiplier += 0.1`.
3. Si `currentMultiplier >= crashPoint` :
   - `clearInterval`, `collector.stop`
   - `activeGames.delete`
   - Mise à jour du message en statut "crashed" (perte)
   - Fin.
4. Sinon → mise à jour de l’embed avec le nouveau multiplicateur.

### 5. Handler "collect" (clic sur CASH OUT)

1. **Clic après crash**  
   Si `cashedOut` → `i.deferUpdate()` pour éviter "Interaction Failed".

2. **Marquage du cashout**  
   `cashedOut = true`, `clearInterval`, `collector.stop`, `activeGames.delete`.

3. **Calcul du gain**  
   - `total = floor(bet × currentMultiplier)`  
   - `profit = total - bet`  
   - Si Heure de Gloire → `profit *= 2`

4. **Crédit**  
   `db.updateBalance(message.author.id, bet + finalGain)`  
   (on recrédite la mise + profit).

5. **Mise à jour du message**  
   `i.update({ embeds: [getEmbed('cashed', ...)], components: [] })`  
   L’UI est mise à jour avant l’annonce des gros gains pour éviter un embed "figé".

6. **Gros gain (profit ≥ 500)**  
   Message dans le salon `WINS_CHANNEL_ID` avec détails du gain.

---

## Gestion d’état

| Variable | Portée | Rôle |
|----------|--------|------|
| `activeGames` | Module (Set global) | Empêche plusieurs parties Crash simultanées par utilisateur. Persiste entre exécutions tant que le processus tourne. |
| `cashedOut` | Closure de `execute` | Indique si le joueur a déjà encaissé. |
| `currentMultiplier` | Closure | Valeur courante du multiplicateur. |
| `crashPoint` | Closure | Multiplicateur auquel le crash aura lieu. |
| `bet` | Closure | Mise en BigInt. |

---

## Sécurisation et cas limites

- **Free roll** : la mise est débitée avant l’ajout dans `activeGames`.  
- **Lock utilisateur** : si `updateBalance` échoue, l’utilisateur n’est pas ajouté à `activeGames`.  
- **Clic tardif** : si le joueur clique après le crash, `deferUpdate()` évite "Interaction Failed".  
- **UI prioritaire** : `i.update` est appelé avant l’annonce des gros gains.  
- **Double clic** : le `customId` est unique par message ; le collector ne peut traiter qu’un seul clic valide par partie.

---

## Schéma de flux

```
;crash 100
     │
     ▼
┌─────────────────┐
│ Validation      │ → Erreur si partie en cours / mise invalide / solde insuffisant
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ db.updateBalance│ (débit -100)
│ (-bet)          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     setInterval (1s)      ┌─────────────────┐
│ Boucle multi    │ ◄──────────────────────► │ multi += 0.1    │
│ 1.0 → crashPoint│                          │ msg.edit embed  │
└────────┬────────┘                          └────────┬────────┘
         │                                            │
         │  multi >= crashPoint                        │
         ▼                                            │
┌─────────────────┐                                   │
│ CRASH           │                                   │
│ Perte, fin      │                                   │
└─────────────────┘                                   │
                                                      │
         ┌────────────────────────────────────────────┘
         │  Clic CASH OUT
         ▼
┌─────────────────┐
│ db.updateBalance│ (crédit bet + profit)
│ i.update embed  │
│ (optionnel)     │
│ Annonce gros    │
│ gain            │
└─────────────────┘
```

---

## Points d’intégration

- **Bot principal** : `bot.js` → `messageCreate` → `command.execute(message, args, db)` pour `;crash`
- **Aide** : `commands/help.js` liste la commande `;crash [mise/all]`
- **Setup** : `commands/setupcasino.js` décrit le Crash dans la présentation du casino
- **Tests** : `tests/test_simulation.js` simule une partie et un cashout
