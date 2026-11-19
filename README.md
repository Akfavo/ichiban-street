# いちばん通り · Ichiban Street — Survie au Japon

Un diorama 3D isométrique (Vite + TypeScript + Three.js) pour s'entraîner aux interactions du quotidien au Japon : acheter une Suica, payer au konbini, commander des ramen, ouvrir un compte, prendre une eSIM, détaxer un appareil photo, acheter un jeu, une figurine ou un médicament, faire son check-in à l'hôtel, commander au distributeur de tickets, déclarer un objet perdu au kōban ou demander son chemin.

**Aucun asset externe** : bâtiments, personnages, enseignes japonaises (Canvas 2D), textures et bruitages d'ambiance (Web Audio) sont générés en code.

## Démarrage

```bash
npm install
npm run dev
```

Le navigateur s'ouvre sur http://localhost:5173. Cliquez sur **Commencer** (cela débloque l'audio du navigateur).

## Commandes

| Touche | Action |
| --- | --- |
| Flèches / ZQSD / WASD | Se déplacer (relatif à l'écran) |
| Clic gauche maintenu | Le perso suit la souris |
| Maj | Courir |
| Espace / Entrée | Parler (ou entrez simplement dans le halo doré) |
| 1 / 2 / 3 | Choisir une réponse |
| H | Afficher / masquer le français (mode moyen) |
| R | Réécouter · **V** : vitesse 1.0x ↔ 0.75x |
| C | Carnet de survie |
| M | Musique d'ambiance on / off |
| Échap | Fermer |

**⚙️ Paramètres** (barre du haut) : volume de la musique, des voix et des effets, difficulté, qualité graphique (Haute / Économie pour les petits ordinateurs). Tout est mémorisé.

## Trois niveaux de difficulté

À choisir sur l'écran d'accueil, puis à tout moment via le bouton de mode de la barre du haut :

| Mode | Répliques du PNJ | Vos réponses |
| --- | --- | --- |
| 🌱 Facile | romaji + français | romaji + français |
| 🎋 Moyen | kana + romaji, français à la demande (H) | kana + romaji |
| 🏯 Difficile | audio seul, texte révélé après la bonne réponse | kana seuls |

## Les 15 lieux

Deux quartiers à l'identité différente, reliés par le **shinkansen 新幹線** :

- **🚉 Ekimae 駅前** (point de départ) : l'avenue devant la gare, avec la Gare 駅 et le **Kōban 交番** (objets perdus), puis 3 + 3 commerces de part et d'autre : Konbini · Ramen · Banque / Poste · Téléphonie · Pharmacie · **Boulangerie パン屋**.
- **⛲ Place de la fontaine 噴水広場** : une place ronde avec sa fontaine, ses cerisiers, un torii et une gare de shinkansen sur viaduc. Six commerces autour : Électronique · Jeux vidéo · Figurines · **Izakaya 居酒屋** (ouvert la nuit seulement) · **Hôtel ホテル** · **Restaurant à tickets 定食屋** (avec son しょっけんき), plus une **passante** à qui demander son chemin.

**Prendre le train** : parlez à l'agent du quai (halo bleu, chevrons au sol, point bleu sur la minicarte ; panneau des départs 〜ゆき au-dessus du quai). Un billet vous apprend 〜ゆき (« à destination de »), puis une courte cinématique de jour se lance (le shinkansen file sur son viaduc entre rizières, villages, cerisiers et mont Fuji) avec sa musique (`public/music/shinkansen.mp3`). On peut la passer avec **Échap**, **Entrée**, **Espace** ou le bouton « Passer ». Une fois quelques lieux réussis à Ekimae, un message vous invite à découvrir la place.

**Quantités** : à la boulangerie, au ramen et à l'izakaya, un sélecteur « 🔢 Combien ? − n + » (ou ← / →) permet de choisir le nombre (3 melon pan, 2 personnes…). Les réponses se réécrivent avec le bon compteur (〜つ, 〜にん…) et la voix dit ce nombre-là (`{id}_r_{n}.mp3`, sinon synthèse du navigateur). Les pièges utilisent le mauvais compteur. Côté données : `qty` sur l'étape, marqueurs `{tsu}` `{nin}` `{mei}` `{ji}` `{hon}` `{mai}` `{n}` `{s}` dans les textes, `qtyFrom` pour qu'une réplique reprenne le nombre choisi.

## Jour / Nuit

Bouton **☀️ Jour / 🌙 Nuit** dans la barre du haut (touche **N**, choix mémorisé). La nuit, enseignes, vitrines, distributeurs, lampadaires et phares de taxi s'allument (éclairage d'ambiance uniforme, sans lumières dynamiques) ; certaines répliques passent à こんばんは (Konbanwa). La **banque** est fermée la nuit (営業時間外) et l'**izakaya** n'ouvre que la nuit (準備中 le jour) : les horaires se règlent dans `cityConfig.ts` (`open: 'day' | 'night'`).

Chaque scénario compte 3 ou 4 échanges + une conclusion. Une mauvaise réponse affiche une explication et vous laisse réessayer. Les phrases réussies s'ajoutent au **Carnet de survie**, avec audio. La progression est sauvegardée dans le navigateur (localStorage).

## Pour apprendre

- **🙏 Mō ichido** : dans le dialogue, votre personnage dit « もう いちど おねがいします » (encore une fois, s'il vous plaît) et le PNJ répète plus lentement. La phrase la plus utile du voyage.
- **Variantes** : le jour, certains PNJ disent la même chose autrement (champ `vars` d'une réplique), pour habituer l'oreille.
- **💴 Prix à l'oreille** (carnet) : on entend un prix, on choisit parmi des montants qui se ressemblent (1 800 / 1 080 / 8 100…). Série et record affichés.
- **🔁 À revoir** (carnet) : les échanges où vous vous êtes trompé·e. Ils disparaissent quand vous les réussissez du premier coup, ou avec « ✓ Retenu ».

## Ambiance sonore

Rumeur de la ville, brouhaha de l'izakaya, mélodie de la gare, plus quelques petits effets (carillon du konbini, bonne / mauvaise réponse). Tout est synthétisé en direct (`src/engine/ambience.ts`), sans fichier ni licence ; le volume dépend de la distance. Pour écouter chaque son séparément : `npm run dev` puis http://localhost:5173/ambiance.html (page de développement, absente du build).

## Musique d'ambiance

Le thème `public/music/theme.mp3` tourne en boucle dès que vous cliquez sur **Commencer**. Son volume baisse automatiquement pendant les voix. Bouton 🎵 (ou touche **M**) pour le couper ; le choix est mémorisé. Pour changer de musique, remplacez simplement ce fichier. La musique du trajet en train est `public/music/shinkansen.mp3` : assurez-vous d'avoir les droits sur ces fichiers avant toute mise en ligne publique.

## Voix naturelles (optionnel) — Cartesia

Sans fichiers audio, l'application utilise la synthèse vocale japonaise du navigateur (`speechSynthesis`, ja-JP). Pour des voix naturelles :

```bash
cp .env.example .env     # puis renseignez CARTESIA_API_KEY
npm run generate-voices
```

- Génère `public/audio/{id}.mp3` pour chaque réplique des PNJ, chaque bonne réponse du joueur (`{id}_r.mp3`) chaque conclusion et chaque variante (`{id}_v1.mp3`…).
- Les fichiers déjà présents sont ignorés. Options : `-- --force` (tout régénérer), `-- --dry-run` (lister), `-- --only=konbini` (un seul scénario).
- Modèle par défaut `sonic-3.6`, langue `ja`. Si votre compte refuse ce modèle, mettez `CARTESIA_MODEL=sonic-3` dans `.env`.
- `CARTESIA_VOICE_ID_HOMME` / `CARTESIA_VOICE_ID_FEMME` : voix des PNJ selon leur genre (champ `npc.gender` dans `src/data/cityConfig.ts`). Si l'une manque, une voix japonaise du bon genre est choisie automatiquement. `CARTESIA_PLAYER_VOICE_ID` : voix de vos réponses (sinon la voix homme). Un PNJ peut aussi avoir sa propre voix via `npc.cartesiaVoiceId`.

L'application détecte automatiquement les MP3 (indicateur « Voix MP3 » / « Synthèse navigateur » dans le dialogue).

## Architecture

```
src/
  data/
    cityConfig.ts    ← lieux, couleurs, enseignes, tenues des PNJ, décor, caméra, lumière
    scenarios.ts     ← tous les dialogues (kana / romaji / français, choix + feedback)
    prices.ts        ← mini-jeu « Prix à l'oreille »
  engine/
    game.ts          ← rendu, caméra orthographique isométrique, boucle, mise en scène
    world.ts         ← construction procédurale du diorama, PNJ, halos, transparence
    character.ts     ← personnage articulé (marche, salut ojigi)
    textures.ts      ← enseignes et textures en Canvas 2D
    collisions.ts    ← collisions AABB
    controls.ts      ← clavier (flèches, ZQSD, WASD)
    audioManager.ts  ← MP3 → repli speechSynthesis, vitesse 1.0x / 0.75x
    ambience.ts      ← ambiance sonore procédurale (Web Audio)
    progress.ts      ← sauvegarde localStorage
  ui/                ← dialogue, carnet, HUD (HTML/CSS)
scripts/
  generate-voices.ts ← génération des voix via Cartesia
```

Pour ajouter ou modifier un dialogue, éditez `src/data/scenarios.ts`, puis relancez `npm run generate-voices` (seuls les nouveaux fichiers sont générés ; utilisez `--force --only=<id>` si vous modifiez une réplique existante).

## Mise en ligne (GitHub + Vercel)

- Importez le dépôt dans Vercel : `vercel.json` règle tout (build `npm run build`, dossier `dist`, en-têtes de sécurité stricts et cache des MP3).
- Le site est 100 % statique : aucun serveur, aucune clé, aucun cookie. La progression reste dans le navigateur du joueur.
- La clé Cartesia ne sert qu'au script local `generate-voices` : elle reste dans `.env`, ignoré par git (comme `audio-archive/`). Ne la mettez **jamais** dans les variables d'environnement Vercel, elle n'y sert à rien.

## Scripts

- `npm run dev` : serveur de développement
- `npm run build` : vérification TypeScript + build de production dans `dist/`
- `npm run preview` : prévisualiser le build
- `npm run generate-voices` : générer les voix
