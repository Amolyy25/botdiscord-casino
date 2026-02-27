# PLAN : Correction des problèmes d'interface du Crash

## 📋 Checklist (cocher au fur et à mesure)

- [x] **Analyse du contexte**
    - [x] Analyser le fichier `commands/crash.js`
    - [x] Comprendre le flux d'exécution lors du cashout
    - [x] Identifier pourquoi l'embed ne se met pas à jour visuellement

- [x] **Problème 1 : L'embed ne bouge pas après cashout**
    - [x] Vérifier la gestion des promesses lors de `i.update`.
    - [x] Vérifier si `clearInterval` est appelé correctement et si le `setInterval` n'écrase pas l'embed final.
    - [x] Déplacé `i.update` AVANT l'annonce des gros gains pour prioriser la réponse utilisateur.
    - [x] Ajout de `return` explicite dans le `setInterval` si `cashedOut` est true.

- [x] **Problème 2 : Affichage du multiplicateur final**
    - [x] Modifier l'embed de cashout pour afficher : "Vous avez retiré à X.XXx (Crash à Y.YYx)".
    - [x] Le multiplicateur de crash (`crashPoint`) est déjà calculé au début, il suffit de l'ajouter à l'embed final.

- [x] **Implémentation et Validation**
    - [x] Appliquer les correctifs.
    - [x] Vérifier que le cashout arrête bien l'animation ET met à jour l'embed.
    - [x] Vérifier que le `crashPoint` est visible après cashout.

## 📁 Fichiers impactés
- `commands/crash.js`

## 📊 Statut actuel
**Date** : 16 Février 2026
**Progression** : 4 / 4 étapes terminées
**Prochaine étape** : Terminé.
