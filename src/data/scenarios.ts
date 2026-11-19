/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  SCÉNARIOS DE DIALOGUE
 *  Chaque lieu = 1 scénario = plusieurs étapes. À chaque étape :
 *    • une réplique du PNJ (kana / romaji / traduction FR) — son `id` sert aussi
 *      de nom de fichier audio : public/audio/{id}.mp3
 *    • 3 réponses possibles du joueur (1 correcte) avec un feedback pédagogique.
 *      La bonne réponse a son propre audio : public/audio/{id}_r.mp3
 *  Les répliques sont écrites en kana uniquement (espaces entre les groupes de
 *  mots pour faciliter la lecture, comme dans les manuels débutants).
 *  Fichier de données pur (lu aussi par scripts/generate-voices.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface Line {
  id: string;
  kana: string;
  romaji: string;
  fr: string;
  /** texte alternatif envoyé à la synthèse vocale (ex. avec kanji) */
  tts?: string;
  /** variante du soir (mode 🌙 Nuit) — audio : public/audio/{id}_n.mp3 */
  night?: { kana: string; romaji: string; fr: string; tts?: string };
  /**
   * la réplique reprend la quantité choisie à une étape précédente (id de l'étape) :
   * ses textes contiennent des marqueurs {tsu}, {nin}, {n}… — audio : {id}_{n}.mp3
   */
  qtyFrom?: string;
  /** textes particuliers pour certaines quantités (ex. 1 → « Je suis seul·e ») */
  alt?: Record<number, Partial<QtyTexts>>;
  /**
   * autres façons de dire la même chose (le jour), tirées au hasard
   * pour habituer l'oreille — audio : public/audio/{id}_v1.mp3, _v2…
   */
  vars?: { kana: string; romaji: string; fr: string; tts?: string }[];
}

export interface Choice {
  kana: string;
  romaji: string;
  fr: string;
  correct: boolean;
  feedback: string;
  tts?: string;
  alt?: Record<number, Partial<QtyTexts>>;
}

/**
 * Choix d'une quantité au moment de répondre (sélecteur « Combien ? − 3 + »).
 * Les réponses de l'étape utilisent des marqueurs remplacés par le nombre :
 *   {tsu} ひとつ, ふたつ… (objets)   {nin} ひとり, ふたり… (personnes)
 *   {mei} いちめい… (personnes, poli) {ji} いちじ… (heures)
 *   {hon} いっぽん… (objets longs)   {mai} いちまい… (objets plats)
 *   {n} chiffre (pour le français)   {s} « s » du pluriel
 * Audio des bonnes réponses : {id}_r_{n}.mp3
 */
export interface QtyPick {
  /** ce que l'on compte, au singulier et au pluriel (ex. ['melon pan', 'melon pan']) */
  what: [string, string];
  min: number;
  max: number;
  /** valeur de départ, ou id d'une étape précédente dont on reprend le nombre */
  def: number | string;
}

export interface QtyTexts {
  kana: string;
  romaji: string;
  fr: string;
  tts: string;
  feedback: string;
}

export interface Step extends Line {
  choices: Choice[];
  qty?: QtyPick;
}

export interface Scenario {
  id: string;
  title: string;
  goal: string;
  steps: Step[];
  outro: Line;
  tip: string;
}

const ok = (kana: string, romaji: string, fr: string, feedback: string): Choice => ({ kana, romaji, fr, feedback, correct: true });
const ko = (kana: string, romaji: string, fr: string, feedback: string): Choice => ({ kana, romaji, fr, feedback, correct: false });

export const SCENARIOS: Record<string, Scenario> = {
  /* ───────────────────────────── 1. GARE ───────────────────────────── */
  eki: {
    id: 'eki',
    title: 'Gare : carte Suica & sortie Est',
    goal: 'Demandez une carte Suica, chargez-la, puis demandez où se trouve la sortie Est.',
    steps: [
      {
        id: 'eki_1',
        kana: 'いらっしゃいませ。 どう されましたか？',
        romaji: 'Irasshaimase. Dō saremashita ka?',
        fr: 'Bonjour. Que puis-je faire pour vous ?',
        vars: [{ kana: 'なにか おこまりですか？', romaji: 'Nanika o-komari desu ka?', fr: 'Vous avez besoin d’aide ?' }],
        night: { kana: 'こんばんは。 どう されましたか？', romaji: 'Konbanwa. Dō saremashita ka?', fr: 'Bonsoir. Que puis-je faire pour vous ?' },
        choices: [
          ok('すみません、 スイカ ください。', 'Sumimasen, Suika kudasai.', "Excusez-moi, une Suica s'il vous plaît.",
            "Parfait ! « すみません » + objet + « ください » : la formule de survie qui marche partout. La carte demande une caution de 500 ¥, rendue quand vous la restituez. Pour un court séjour, il existe aussi la « Welcome Suica » (sans caution) ou la Suica sur smartphone."),
          ko('すいかを たべたいです。', 'Suika o tabetai desu.', 'Je voudrais manger une pastèque.',
            "Oups : すいか en hiragana, c'est la pastèque ! La carte s'écrit en katakana (スイカ) et on l'achète (かう), on ne la mange pas (たべる)."),
          ko('いただきます。', 'Itadakimasu.', '(Formule dite avant de manger.)',
            "« いただきます » se dit avant un repas. Pour demander quelque chose, commencez par « すみません » (excusez-moi)."),
        ],
      },
      {
        id: 'eki_3',
        kana: 'チャージは いくらに なさいますか？',
        romaji: 'Chāji wa ikura ni nasaimasu ka?',
        fr: 'Combien souhaitez-vous charger ?',
        vars: [{ kana: 'いくら チャージ しますか？', romaji: 'Ikura chāji shimasu ka?', fr: 'Combien voulez-vous charger ?' }],
        choices: [
          ok('にせんえん おねがいします。', 'Nisen-en onegai shimasu.', '2 000 yens, s\'il vous plaît.',
            "Parfait. Montant + « おねがいします » marche partout. Rappel : ひゃく = 100, せん = 1 000, いちまん = 10 000."),
          ko('にじに おねがいします。', 'Niji ni onegai shimasu.', 'À 2 heures, s\'il vous plaît.',
            "にじ = 2 heures ! Un montant se dit avec えん (yen) : にせんえん = 2 000 ¥."),
          ko('いくらですか？', 'Ikura desu ka?', "C'est combien ?",
            "C'est vous qui choisissez le montant ! Donnez une somme : « にせんえん おねがいします »."),
        ],
      },
      {
        id: 'eki_4',
        kana: 'はい、 こちらが スイカです。 ほかに なにか ございますか？',
        romaji: 'Hai, kochira ga Suika desu. Hoka ni nanika gozaimasu ka?',
        fr: 'Voici votre Suica. Puis-je faire autre chose pour vous ?',
        choices: [
          ok('ひがしぐちは どこですか？', 'Higashi-guchi wa doko desu ka?', 'Où est la sortie Est ?',
            "Excellent ! « 〜は どこですか » = « où est… ? », la question la plus utile du voyage. ひがし = est, にし = ouest, みなみ = sud, きた = nord ; 〜ぐち = sortie. Vous entendrez souvent la version polie « どちら »."),
          ko('にしぐちは なんじですか？', 'Nishi-guchi wa nanji desu ka?', 'À quelle heure est la sortie Ouest ?',
            "なんじ = « quelle heure ». Pour un lieu, utilisez どこ. Et vous cherchez l'est (ひがし), pas l'ouest (にし)."),
          ko('ひだりぐちを ください。', 'Hidari-guchi o kudasai.', 'Donnez-moi la « bouche gauche ».',
            "ひだり = gauche, pas « est ». Et on ne réclame pas une sortie avec ください : on demande où elle est (どこですか)."),
        ],
      },
    ],
    outro: {
      id: 'eki_end',
      kana: 'ひがしぐちは この かいさつを でて、 みぎです。 おきをつけて！',
      romaji: 'Higashi-guchi wa kono kaisatsu o dete, migi desu. O-ki o tsukete!',
      fr: 'Pour la sortie Est, passez ce portique puis à droite. Bon voyage !',
    },
    tip: "Aux portiques (かいさつ), posez la Suica sur le lecteur bleu. Elle fonctionne aussi dans les konbini, les distributeurs de boissons et les casiers à bagages.",
  },

  /* ───────────────────────────── 2. KONBINI ───────────────────────────── */
  konbini: {
    id: 'konbini',
    title: 'Konbini : bento, sac & paiement',
    goal: 'Achetez un bento : acceptez qu\'on le réchauffe, refusez le sac et payez avec votre carte IC.',
    steps: [
      {
        id: 'kon_1',
        kana: 'いらっしゃいませ。 こちら、 あたためますか？',
        romaji: 'Irasshaimase. Kochira, atatamemasu ka?',
        fr: 'Bonjour. Je vous le réchauffe ?',
        choices: [
          ok('はい、 おねがいします。', 'Hai, onegai shimasu.', "Oui, s'il vous plaît.",
            "Parfait ! « あたためますか » est LA question du konbini. Pour refuser : « いいえ、けっこうです » ou « そのままで だいじょうぶです »."),
          ko('はい、 あついです。', 'Hai, atsui desu.', 'Oui, il fait chaud.',
            "あつい = chaud (temps ou objet). La caissière propose de réchauffer (あたためる) votre bento : répondez « はい、おねがいします »."),
          ko('おやすみなさい。', 'Oyasumi nasai.', 'Bonne nuit.',
            "« おやすみなさい » se dit avant d'aller dormir. Même à 3 h du matin au konbini, répondez plutôt « はい、おねがいします » !"),
        ],
      },
      {
        id: 'kon_2',
        kana: 'ふくろは ごりようですか？',
        romaji: 'Fukuro wa go-riyō desu ka?',
        fr: 'Voulez-vous un sac ?',
        vars: [{ kana: 'ふくろ、 いりますか？', romaji: 'Fukuro, irimasu ka?', fr: 'Il vous faut un sac ?' }, { kana: 'ふくろは おつけしますか？', romaji: 'Fukuro wa otsuke shimasu ka?', fr: 'Je vous mets un sac ?' }],
        choices: [
          ok('いいえ、 だいじょうぶです。', 'Iie, daijōbu desu.', 'Non, ça ira.',
            "Bien ! Depuis 2020 les sacs plastiques sont payants (3 à 5 ¥). « だいじょうぶです » est le « non merci » le plus naturel. Pour en avoir un : « ふくろ、おねがいします »."),
          ko('はい、 ふくろです。', 'Hai, fukuro desu.', "Oui, c'est un sac.",
            "Vous décrivez un sac ! ごりようですか = « en utiliserez-vous un ? ». Répondez « いいえ、だいじょうぶです » ou « はい、おねがいします »."),
          ko('ふくろうが すきです。', 'Fukurō ga suki desu.', "J'aime les hiboux.",
            "ふくろう (voyelle longue) = hibou ! ふくろ = sac. Les voyelles longues changent le sens des mots."),
        ],
      },
      {
        id: 'kon_3',
        kana: 'ポイントカードは おもちですか？',
        romaji: 'Pointo kādo wa o-mochi desu ka?',
        fr: 'Avez-vous une carte de fidélité ?',
        choices: [
          ok('いいえ、 もっていません。', 'Iie, motte imasen.', "Non, je n'en ai pas.",
            "Exact ! おもちですか est la forme honorifique de « avez-vous ». Vous répondez avec le verbe simple もつ : « もっていません ». Un petit geste de la main devant soi suffit aussi."),
          ko('おもちを ください。', 'O-mochi o kudasai.', 'Un mochi, s\'il vous plaît.',
            "Piège classique : おもち (gâteau de riz) ! Ici おもち vient de もつ (posséder) en version polie."),
          ko('はい、 おもちです。', 'Hai, o-mochi desu.', "Oui, j'en possède (honorifique).",
            "On n'utilise jamais le honorifique お〜 pour soi-même. Répondez simplement « いいえ、もっていません »."),
        ],
      },
      {
        id: 'kon_4',
        kana: 'おしはらいは どう なさいますか？',
        romaji: 'O-shiharai wa dō nasaimasu ka?',
        fr: 'Comment souhaitez-vous régler ?',
        vars: [{ kana: 'おしはらいは なにで なさいますか？', romaji: 'Oshiharai wa nani de nasaimasu ka?', fr: 'Vous payez avec quoi ?' }],
        choices: [
          ok('スイカで おねがいします。', 'Suika de onegai shimasu.', "Avec la Suica, s'il vous plaît.",
            "Parfait ! で indique le moyen. Variantes : « カードで » (carte bancaire), « げんきんで » (espèces). Ensuite on pose la carte sur le lecteur."),
          ko('スイカを かいたいです。', 'Suika o kaitai desu.', 'Je voudrais acheter une Suica.',
            "La Suica s'achète à la gare ! Ici, dites avec quoi vous payez : « スイカで おねがいします »."),
          ko('あとで はらいます。', 'Ato de haraimasu.', 'Je paierai plus tard.',
            "Impossible au konbini ! Indiquez le moyen de paiement avec で : « スイカで / カードで おねがいします »."),
        ],
      },
    ],
    outro: {
      id: 'kon_end',
      kana: 'では、 こちらに タッチ して ください。 ありがとうございました！',
      romaji: 'Dewa, kochira ni tatchi shite kudasai. Arigatō gozaimashita!',
      fr: 'Alors, posez votre carte ici. Merci beaucoup !',
    },
    tip: "Au konbini, la monnaie se pose dans le petit plateau (トレー), pas dans la main. Les toilettes sont souvent accessibles : « トイレを かりても いいですか？ »",
  },

  /* ───────────────────────────── 3. RAMEN ───────────────────────────── */
  ramen: {
    id: 'ramen',
    title: 'Ramen : table, commande, kaedama & addition',
    goal: 'Annoncez le nombre de personnes (choisissez-le !), commandez autant de ramen shōyu, puis prenez un kaedama (rab de nouilles).',
    steps: [
      {
        id: 'ram_1',
        kana: 'いらっしゃいませ！ なんめいさまですか？',
        romaji: 'Irasshaimase! Nan-mei sama desu ka?',
        fr: 'Bienvenue ! Vous êtes combien ?',
        vars: [{ kana: 'おなんめいさまですか？', romaji: 'O-nanmei-sama desu ka?', fr: 'Vous êtes combien ?' }],
        qty: { what: ['personne', 'personnes'], min: 1, max: 5, def: 2 },
        choices: [
          { ...ok('{nin}です。', '{nin} desu.', 'Nous sommes {n}.',
            "Parfait ! Les personnes se comptent avec 〜にん : ひとり (1) et ふたり (2) sont irréguliers, puis さんにん, よにん (pas « よんにん » !), ごにん. Vous pouvez aussi montrer le nombre avec les doigts."),
            alt: { 1: { fr: 'Je suis seul·e.', feedback: "Parfait ! ひとり = une personne (irrégulier). Seul·e, on vous installera souvent au comptoir (カウンター)." } } },
          ko('{mei}さまです。', '{mei} sama desu.', 'Nous sommes {n} honorables clients.',
            "さま est un honorifique réservé aux autres : on ne l'utilise jamais pour soi. Le serveur dit なんめいさま, vous répondez simplement avec 〜にん (ひとり, ふたり, さんにん…)."),
          ko('{tsu}です。', '{tsu} desu.', '{n} (objets).',
            "ひとつ, ふたつ, みっつ… comptent les objets. Pour les personnes : ひとり, ふたり, さんにん, よにん, ごにん."),
        ],
      },
      {
        id: 'ram_2',
        kana: 'こちらの せきへ どうぞ。 ごちゅうもんは おきまりですか？',
        romaji: 'Kochira no seki e dōzo. Go-chūmon wa o-kimari desu ka?',
        fr: 'Par ici, je vous prie. Avez-vous choisi ?',
        qty: { what: ['ramen', 'ramen'], min: 1, max: 5, def: 'ram_1' },
        choices: [
          ok('しょうゆラーメンを {tsu} おねがいします。', 'Shōyu rāmen o {tsu} onegai shimasu.', "{n} ramen shōyu, s'il vous plaît.",
            "Très bien : plat + を + nombre + おねがいします. Les plats se comptent avec ひとつ, ふたつ, みっつ, よっつ, いつつ. Beaucoup de shops utilisent aussi un distributeur de tickets (しょっけんき) à l'entrée."),
          ko('しょうゆを {nin} おねがいします。', 'Shōyu o {nin} onegai shimasu.', "{n} personne{s} de sauce soja, s'il vous plaît.",
            "ひとり, ふたり, さんにん… comptent les personnes ! Pour les plats, utilisez ひとつ, ふたつ, みっつ…"),
          ko('メニューは おいしいです。', 'Menyū wa oishii desu.', 'Le menu est délicieux.',
            "Vous complimentez le menu lui-même 😄. Commandez : plat + を + nombre + おねがいします."),
        ],
      },
      {
        id: 'ram_3',
        kana: 'かえだまは いかがですか？ ひゃくごじゅうえんです。',
        romaji: 'Kaedama wa ikaga desu ka? Hyaku-gojū-en desu.',
        fr: 'Un supplément de nouilles ? C\'est 150 yens.',
        choices: [
          ok('はい、 かえだま ひとつ おねがいします。', 'Hai, kaedama hitotsu onegai shimasu.', "Oui, un kaedama s'il vous plaît.",
            "Super ! Le かえだま est une portion de nouilles ajoutée dans votre bouillon, typique des ramen tonkotsu. Gardez donc du bouillon ! En partant, on paie à la caisse, sans pourboire : un « ごちそうさまでした » suffit."),
          ko('いいえ、 かえります。', 'Iie, kaerimasu.', 'Non, je rentre chez moi.',
            "かえる = rentrer ! Ça ressemble à かえだま mais ça n'a rien à voir. Pour accepter : « はい、かえだま ひとつ おねがいします »."),
          ko('いいえ、 おなかが すきました。', 'Iie, onaka ga sukimashita.', "Non, j'ai faim.",
            "Contradictoire : vous refusez du rab alors que vous avez faim ! Pour des nouilles en plus : « はい、おねがいします »."),
        ],
      },
    ],
    outro: {
      id: 'ram_end',
      qtyFrom: 'ram_2',
      kana: 'おかいけい、 {n}えんです。 ありがとうございました！',
      romaji: 'O-kaikei, {n}-en desu. Arigatō gozaimashita!',
      fr: 'Cela fait {n} yens. Merci beaucoup !',
      alt: {
        1: { kana: 'おかいけい、 せんひゃくごじゅうえんです。 ありがとうございました！', romaji: 'O-kaikei, sen-hyaku-gojū-en desu. Arigatō gozaimashita!', fr: 'Cela fait 1 150 yens. Merci beaucoup !' },
        2: { kana: 'おかいけい、 にせんひゃくごじゅうえんです。 ありがとうございました！', romaji: 'O-kaikei, nisen-hyaku-gojū-en desu. Arigatō gozaimashita!', fr: 'Cela fait 2 150 yens. Merci beaucoup !' },
        3: { kana: 'おかいけい、 さんぜんひゃくごじゅうえんです。 ありがとうございました！', romaji: 'O-kaikei, sanzen-hyaku-gojū-en desu. Arigatō gozaimashita!', fr: 'Cela fait 3 150 yens. Merci beaucoup !' },
        4: { kana: 'おかいけい、 よんせんひゃくごじゅうえんです。 ありがとうございました！', romaji: 'O-kaikei, yonsen-hyaku-gojū-en desu. Arigatō gozaimashita!', fr: 'Cela fait 4 150 yens. Merci beaucoup !' },
        5: { kana: 'おかいけい、 ごせんひゃくごじゅうえんです。 ありがとうございました！', romaji: 'O-kaikei, gosen-hyaku-gojū-en desu. Arigatō gozaimashita!', fr: 'Cela fait 5 150 yens. Merci beaucoup !' },
      },
    },
    tip: "En sortant, lancez un « ごちそうさまでした ! » au chef : c'est très apprécié. Et aspirer bruyamment ses nouilles est tout à fait normal.",
  },

  /* ───────────────────────────── 4. BANQUE / POSTE ───────────────────────────── */
  bank: {
    id: 'bank',
    title: 'Banque / Poste : retrait, compte & papiers',
    goal: 'Trouvez le distributeur, demandez à ouvrir un compte et présentez vos papiers.',
    steps: [
      {
        id: 'ban_1',
        kana: 'いらっしゃいませ。 ほんじつは どのような ごようけんでしょうか？',
        romaji: 'Irasshaimase. Honjitsu wa dono yō na go-yōken deshō ka?',
        fr: "Bonjour. Quel est l'objet de votre visite aujourd'hui ?",
        choices: [
          ok('エーティーエムは どこですか？', 'Ētīemu wa doko desu ka?', 'Où est le distributeur ?',
            "Parfait ! « 〜は どこですか » encore une fois : elle sert partout. ATM se lit lettre par lettre (エーティーエム). Les ATM de la poste (ゆうちょ) et des konbini acceptent la plupart des cartes étrangères."),
          ko('げんきですか？', 'Genki desu ka?', 'Vous allez bien ?',
            "げんき (la forme) ≠ げんきん (l'argent liquide) ! Un seul ん change tout."),
          ko('おかねを ください。', 'O-kane o kudasai.', "Donnez-moi de l'argent.",
            "Ça ressemble à un braquage 😅. Dites ce que vous voulez faire : « エーティーエムは どこですか？ »."),
        ],
      },
      {
        id: 'ban_2',
        kana: 'エーティーエムは あちらです。 かいがいの カードも つかえますよ。 ほかに ございますか？',
        romaji: 'Ētīemu wa achira desu. Kaigai no kādo mo tsukaemasu yo. Hoka ni gozaimasu ka?',
        fr: 'Le distributeur est là-bas, les cartes étrangères fonctionnent aussi. Autre chose ?',
        choices: [
          ok('はい、 こうざを つくりたいです。', 'Hai, kōza o tsukuritai desu.', 'Oui, je voudrais ouvrir un compte.',
            "Bien ! こうざ = compte bancaire ; on « crée » (つくる) un compte."),
          ko('こうえんに いきたいです。', 'Kōen ni ikitai desu.', 'Je voudrais aller au parc.',
            "こうえん = parc ! こうざ = compte. Les sons se ressemblent, restez concentré."),
          ko('かいだんを つくりたいです。', 'Kaidan o tsukuritai desu.', 'Je voudrais construire un escalier.',
            "かいだん = escalier 😄. Le mot recherché : こうざ (compte)."),
        ],
      },
      {
        id: 'ban_3',
        kana: 'かしこまりました。 ざいりゅうカードは おもちですか？',
        romaji: 'Kashikomarimashita. Zairyū kādo wa o-mochi desu ka?',
        fr: 'Entendu. Avez-vous votre carte de résident ?',
        choices: [
          ok('はい、 こちらです。', 'Hai, kochira desu.', 'Oui, la voici.',
            "Parfait. Pour ouvrir un compte, il faut en général la ざいりゅうカード (carte de résident) et une adresse au Japon : avec un simple statut de touriste, ce n'est généralement pas possible."),
          ko('はい、 おもちです。', 'Hai, o-mochi desu.', "Oui, j'en possède (honorifique).",
            "Le préfixe お〜 est honorifique : jamais pour soi. Tendez la carte en disant « はい、こちらです »."),
          ko('ざいりゅうは どこですか？', 'Zairyū wa doko desu ka?', 'Où est le « séjour » ?',
            "Question incompréhensible ! On vous demande si vous AVEZ la carte. Montrez-la : « はい、こちらです »."),
        ],
      },
      {
        id: 'ban_4',
        kana: 'ありがとうございます。 パスポートも はいけん できますか？',
        romaji: 'Arigatō gozaimasu. Pasupōto mo haiken dekimasu ka?',
        fr: 'Merci. Puis-je voir aussi votre passeport ?',
        choices: [
          ok('はい、 どうぞ。', 'Hai, dōzo.', 'Oui, je vous en prie.',
            "Bien ! « どうぞ » accompagne le geste de tendre quelque chose. Au Japon, on tend un document à deux mains, tourné vers la personne."),
          ko('はい、 はいけん します。', 'Hai, haiken shimasu.', 'Oui, je vais humblement regarder.',
            "はいけん est le verbe humble « regarder » : c'est l'employé qui regarde ! Vous, vous tendez le passeport : « はい、どうぞ »."),
          ko('パスポートは いりません。', 'Pasupōto wa irimasen.', "Je n'ai pas besoin de passeport.",
            "Si, il en faut un : les banques vérifient l'identité. Répondez « はい、どうぞ » en le tendant."),
        ],
      },
    ],
    outro: {
      id: 'ban_end',
      kana: 'では、 こちらの ようしに ごきにゅう ください。 しょうしょう おまちください。',
      romaji: 'Dewa, kochira no yōshi ni go-kinyū kudasai. Shōshō o-machi kudasai.',
      fr: "Veuillez remplir ce formulaire. Un instant, s'il vous plaît.",
    },
    tip: "Gardez toujours un peu de liquide : beaucoup de petits restos et de temples ne prennent pas la carte. Les ATM des konbini sont ouverts 24h/24.",
  },

  /* ───────────────────────────── 5. TÉLÉCOM ───────────────────────────── */
  telecom: {
    id: 'telecom',
    title: 'Boutique télécom : SIM / eSIM avec numéro',
    goal: 'Demandez une SIM avec numéro japonais, choisissez l\'eSIM et vérifiez la compatibilité de votre téléphone.',
    steps: [
      {
        id: 'tel_1',
        kana: 'いらっしゃいませ。 なにを おさがしですか？',
        romaji: 'Irasshaimase. Nani o o-sagashi desu ka?',
        fr: 'Bonjour. Que recherchez-vous ?',
        vars: [{ kana: 'きょうは どう されましたか？', romaji: 'Kyō wa dō saremashita ka?', fr: 'Qu’est-ce qui vous amène aujourd’hui ?' }],
        choices: [
          ok('でんわばんごうつきの シム、 ありますか？', 'Denwa bangō tsuki no shimu, arimasu ka?', 'Vous avez des SIM avec numéro de téléphone ?',
            "Parfait ! でんわばんごう = numéro de téléphone, 〜つき = « avec ». Sans numéro, on parle de データせんよう (données uniquement). Et toujours « 〜、ありますか » pour demander."),
          ko('でんきが ほしいです。', 'Denki ga hoshii desu.', "Je voudrais de l'électricité.",
            "でんき = électricité ; でんわ = téléphone. Proches, mais pas pareils !"),
          ko('シムさんは どこですか？', 'Shimu-san wa doko desu ka?', 'Où est M. Sim ?',
            "さん s'ajoute aux noms de personnes 😄. Dites : « でんわばんごうつきの シム、ありますか？ »."),
        ],
      },
      {
        id: 'tel_2',
        kana: 'かしこまりました。 イーシムと ぶつりシム、 どちらに なさいますか？',
        romaji: 'Kashikomarimashita. Ī-shimu to butsuri shimu, dochira ni nasaimasu ka?',
        fr: 'Entendu. eSIM ou SIM physique, que préférez-vous ?',
        choices: [
          ok('イーシムで おねがいします。', 'Ī-shimu de onegai shimasu.', "L'eSIM, s'il vous plaît.",
            "Très bien ! 〜で おねがいします = « je choisis… ». La ぶつりシム (SIM physique) reste utile si votre téléphone n'est pas compatible eSIM."),
          ko('ぶつりは むずかしいです。', 'Butsuri wa muzukashii desu.', "La physique, c'est difficile.",
            "ぶつり = la physique (science) ! Ici « ぶつりシム » = SIM physique. Faites un choix : « イーシムで おねがいします »."),
          ko('どちらも いいですね。', 'Dochira mo ii desu ne.', 'Les deux sont bien, hein.',
            "Sympathique, mais il faut choisir ! « イーシムで おねがいします »."),
        ],
      },
      {
        id: 'tel_3',
        kana: 'おきゃくさまの スマホは シムフリーですか？',
        romaji: 'O-kyaku-sama no sumaho wa shimu furī desu ka?',
        fr: 'Votre smartphone est-il désimlocké ?',
        choices: [
          ok('はい、 シムフリーです。', 'Hai, shimu furī desu.', 'Oui, il est désimlocké.',
            "Parfait ! On reprend simplement le mot de la question : シムフリー = désimlocké. Pour l'eSIM, le vendeur vérifiera avec vous. À vérifier avant le départ : sur iPhone, Réglages → Général → Informations → « Aucune restriction SIM »."),
          ko('はい、 フリーです。 ただです。', 'Hai, furī desu. Tada desu.', "Oui, c'est free. C'est gratuit.",
            "シムフリー = désimlocké, pas « gratuit » (ただ / むりょう). Répondez sur la compatibilité."),
          ko('スマホは きらいです。', 'Sumaho wa kirai desu.', 'Je déteste les smartphones.',
            "Pas très utile pour obtenir une SIM 😄. Confirmez : « はい、シムフリーです »."),
        ],
      },
      {
        id: 'tel_4',
        kana: 'でんわばんごうつきの けいやくには、 みぶんしょうめいしょが ひつようです。',
        romaji: 'Denwa bangō tsuki no keiyaku ni wa, mibun shōmeisho ga hitsuyō desu.',
        fr: "Pour un contrat avec numéro, une pièce d'identité est nécessaire.",
        choices: [
          ok('ざいりゅうカードで いいですか？', 'Zairyū kādo de ii desu ka?', 'La carte de résident, ça convient ?',
            "Excellent ! 〜で いいですか = « est-ce que … convient ? ». Les numéros japonais (voix + SMS) demandent souvent une carte de résident ; les touristes prennent surtout des eSIM data."),
          ko('みぶんは ひみつです。', 'Mibun wa himitsu desu.', 'Mon identité est secrète.',
            "Mystérieux, mais impossible sans pièce d'identité ! Proposez un document : « ざいりゅうカードで いいですか？ »."),
          ko('ひつようじゃ ないです。', 'Hitsuyō ja nai desu.', "Ce n'est pas nécessaire.",
            "C'est la loi japonaise : la vérification d'identité est obligatoire pour un numéro. Proposez votre carte."),
        ],
      },
    ],
    outro: {
      id: 'tel_end',
      kana: 'はい、 だいじょうぶです。 せっていまで おてつだい しますね。',
      romaji: 'Hai, daijōbu desu. Settei made o-tetsudai shimasu ne.',
      fr: "Oui, c'est bon. Je vous aide jusqu'au paramétrage.",
    },
    tip: "Les eSIM « data » pour touristes s'achètent en ligne avant le départ. Un numéro japonais sert surtout à réserver des restaurants ou recevoir des SMS de livraison.",
  },

  /* ───────────────────────────── 6. ÉLECTRONIQUE ───────────────────────────── */
  electronics: {
    id: 'electronics',
    title: 'Électronique : câble, adaptateur & détaxe',
    goal: 'Trouvez un câble USB-C, un adaptateur de prise, puis payez en détaxe (menzei).',
    steps: [
      {
        id: 'ele_1',
        kana: 'いらっしゃいませ。 なにか おさがしですか？',
        romaji: 'Irasshaimase. Nanika o-sagashi desu ka?',
        fr: 'Bonjour. Vous cherchez quelque chose ?',
        choices: [
          ok('ユーエスビーシーの ケーブルは どこですか？', 'Yū-esu-bī-shī no kēburu wa doko desu ka?', 'Où sont les câbles USB-C ?',
            "Parfait ! 〜は どこですか = « où est… ? ». Les sigles se lisent lettre par lettre en katakana. Le plus simple reste de montrer une photo du produit sur votre téléphone !"),
          ko('ケーブルカーに のりたいです。', 'Kēburu kā ni noritai desu.', 'Je voudrais prendre le funiculaire.',
            "ケーブルカー = funiculaire 🚡 ! Vous cherchez juste une ケーブル."),
          ko('ここは どこですか？', 'Koko wa doko desu ka?', 'Où suis-je ?',
            "Perdu ? 😄 Demandez l'objet : « ケーブルは どこですか？ »."),
        ],
      },
      {
        id: 'ele_2',
        kana: 'ケーブルは にかいです。 ほかにも ございますか？',
        romaji: 'Kēburu wa ni-kai desu. Hoka ni mo gozaimasu ka?',
        fr: 'Les câbles sont au にかい (2F = 1er étage en France). Autre chose ?',
        choices: [
          ok('へんかんプラグは ありますか？', 'Henkan puragu wa arimasu ka?', 'Avez-vous des adaptateurs de prise ?',
            "Super ! へんかんプラグ = adaptateur ; « 〜は ありますか » = « avez-vous… ? ». Au Japon : prises type A (2 fiches plates), 100 V. La plupart des chargeurs acceptent 100–240 V."),
          ko('へんな プラグですね。', 'Hen na puragu desu ne.', 'Quelle prise bizarre.',
            "へん = bizarre ; へんかん = conversion. Demandez « へんかんプラグは ありますか？ »."),
          ko('プラグを ぬいて ください。', 'Puragu o nuite kudasai.', "Débranchez la prise, s'il vous plaît.",
            "Vous demandez de débrancher quelque chose ! Pour un adaptateur : « へんかんプラグは ありますか？ »."),
        ],
      },
      {
        id: 'ele_3',
        kana: 'おかいけいは ぜんぶで ろくせんはっぴゃくえんです。',
        romaji: 'O-kaikei wa zenbu de rokusen-happyaku-en desu.',
        fr: 'Cela fait 6 800 yens au total.',
        vars: [{ kana: 'ぜんぶで ろくせんはっぴゃくえんに なります。', romaji: 'Zenbu de rokusen happyaku en ni narimasu.', fr: 'Ça vous fera 6 800 yens en tout.' }],
        choices: [
          ok('めんぜいで おねがいします。', 'Menzei de onegai shimasu.', "En détaxe, s'il vous plaît.",
            "Parfait ! めんぜい = détaxe (TAX FREE). Il faut dépasser 5 000 ¥ HT dans la boutique le même jour et présenter son passeport. ⚠️ Le système évolue (remboursement au départ prévu à partir de novembre 2026) : vérifiez avant de partir."),
          ko('ぜいきんは きらいです。', 'Zeikin wa kirai desu.', 'Je déteste les impôts.',
            "Compréhensible, mais pas très efficace 😄. Le mot magique : « めんぜいで おねがいします »."),
          ko('めんを ください。', 'Men o kudasai.', "Des nouilles, s'il vous plaît.",
            "めん = nouilles ! めんぜい = détaxe. Vous êtes dans un magasin d'électronique, pas au ramen."),
        ],
      },
      {
        id: 'ele_4',
        kana: 'かしこまりました。 パスポートを おみせ いただけますか？',
        romaji: 'Kashikomarimashita. Pasupōto o o-mise itadakemasu ka?',
        fr: 'Entendu. Pourriez-vous me montrer votre passeport ?',
        choices: [
          ok('はい、 これです。', 'Hai, kore desu.', 'Oui, le voici.',
            "Bien ! Le passeport original est obligatoire (pas une photo). Le tampon ou l'autocollant d'entrée prouve votre statut de visiteur temporaire."),
          ko('パスポートは ホテルに あります。', 'Pasupōto wa hoteru ni arimasu.', "Mon passeport est à l'hôtel.",
            "Dommage : sans passeport physique, pas de détaxe ! Gardez-le sur vous (c'est d'ailleurs obligatoire pour les étrangers)."),
          ko('みせて ください。', 'Misete kudasai.', "Montrez-moi, s'il vous plaît.",
            "Vous inversez les rôles ! C'est vous qui montrez : « はい、これです »."),
        ],
      },
    ],
    outro: {
      id: 'ele_end',
      kana: 'ありがとうございます。 しゅっこくの ときに、 くうこうで しょうひんを みせて ください。',
      romaji: 'Arigatō gozaimasu. Shukkoku no toki ni, kūkō de shōhin o misete kudasai.',
      fr: "Merci. Lors de votre départ, montrez les articles à l'aéroport.",
    },
    tip: "Les produits détaxés « consommables » (cosmétiques, snacks…) sont emballés sous scellé : ne les ouvrez pas avant d'avoir quitté le Japon.",
  },

  /* ───────────────────────────── 7. JEUX VIDÉO ───────────────────────────── */
  games: {
    id: 'games',
    title: 'Jeux vidéo : neuf ou occasion ?',
    goal: 'Demandez s\'ils ont des jeux Switch, choisissez l\'occasion (chūko), moins chère, et refusez le sac.',
    steps: [
      {
        id: 'gam_1',
        kana: 'いらっしゃいませ！ なにを おさがしですか？',
        romaji: 'Irasshaimase! Nani o o-sagashi desu ka?',
        fr: 'Bienvenue ! Que cherchez-vous ?',
        choices: [
          ok('スイッチの ソフト、 ありますか？', 'Suitchi no sofuto, arimasu ka?', 'Vous avez des jeux Switch ?',
            "Parfait ! « 〜、ありますか » = « vous avez… ? », très simple et partout utile. Au Japon, un jeu se dit ソフト (software)."),
          ko('スイッチを おして ください。', 'Suitchi o oshite kudasai.', "Appuyez sur l'interrupteur, svp.",
            "スイッチ veut aussi dire interrupteur ! Précisez « スイッチの ソフト » (un jeu Switch)."),
          ko('ソフトクリームを ください。', 'Sofuto kurīmu o kudasai.', 'Une glace italienne, svp.',
            "ソフトクリーム = glace italienne 🍦 (délicieuse au Japon, mais pas ici) !"),
        ],
      },
      {
        id: 'gam_2s',
        kana: 'はい、 こちらです。 しんぴんは ごせんごひゃくえん、 ちゅうこは さんぜんごひゃくえんです。',
        romaji: 'Hai, kochira desu. Shinpin wa gosen-gohyaku-en, chūko wa sanzen-gohyaku-en desu.',
        fr: "Oui, par ici. Le neuf est à 5 500 yens, l'occasion à 3 500 yens.",
        choices: [
          ok('ちゅうこ、 おねがいします。', 'Chūko, onegai shimasu.', "L'occasion, s'il vous plaît.",
            "Bien ! しんぴん = neuf, ちゅうこ = occasion. Les boutiques d'occasion japonaises sont réputées pour l'excellent état de leurs produits : on peut demander à voir la boîte en montrant du doigt."),
          ko('しんぶん、 おねがいします。', 'Shinbun, onegai shimasu.', "Un journal, s'il vous plaît.",
            "しんぶん = journal 📰 ; しんぴん = neuf. Ici, vous vouliez l'occasion : « ちゅうこ »."),
          ko('ちゅうごく、 おねがいします。', 'Chūgoku, onegai shimasu.', "La Chine, s'il vous plaît.",
            "ちゅうごく = Chine ! ちゅうこ = occasion. Attention à la longueur des mots."),
        ],
      },
      {
        id: 'gam_3s',
        kana: 'ありがとうございます。 ふくろは ごりようですか？',
        romaji: 'Arigatō gozaimasu. Fukuro wa go-riyō desu ka?',
        fr: 'Merci. Voulez-vous un sac ?',
        choices: [
          ok('いいえ、 だいじょうぶです。', 'Iie, daijōbu desu.', 'Non, ça ira.',
            "Parfait ! La même question qu'au konbini, la même réponse : « だいじょうぶです » est le « non merci » de tous les jours. Les sacs sont payants (quelques yens)."),
          ko('はい、 ふくろです。', 'Hai, fukuro desu.', "Oui, c'est un sac.",
            "Vous décrivez un sac ! ごりようですか = « en utiliserez-vous un ? ». Répondez « いいえ、だいじょうぶです » ou « はい、おねがいします »."),
          ko('これを うります。', 'Kore o urimasu.', 'Je vends ceci.',
            "うる = vendre ; かう = acheter. On vous demande juste si vous voulez un sac !"),
        ],
      },
    ],
    outro: {
      id: 'gam_end2',
      kana: 'ありがとうございました！',
      romaji: 'Arigatō gozaimashita!',
      fr: 'Merci beaucoup !',
    },
    tip: "Les boutiques d'occasion affichent souvent l'état du produit (A = excellent → C = usé). La Switch n'a pas de zonage, mais vérifiez les langues disponibles du jeu.",
  },

  /* ───────────────────────────── 8. FIGURINES ───────────────────────────── */
  figures: {
    id: 'figures',
    title: 'Figurines : vitrine & prix',
    goal: 'Montrez une figurine dans la vitrine, demandez le prix, puis prenez-la.',
    steps: [
      {
        id: 'fig_1',
        kana: 'いらっしゃいませ。 ごゆっくり どうぞ。',
        romaji: 'Irasshaimase. Go-yukkuri dōzo.',
        fr: 'Bienvenue. Prenez votre temps.',
        choices: [
          ok('すみません、 これ、 みせて ください。', 'Sumimasen, kore, misete kudasai.', 'Excusez-moi, montrez-moi celle-ci, svp (en la désignant du doigt).',
            "Parfait ! Les vitrines sont fermées à clé : on ne touche jamais sans demander. Un doigt pointé + « これ » (ceci) + « みせて ください » (montrez-moi) suffit, le vendeur ouvre la vitrine."),
          ko('ケースを こわしても いいですか？', 'Kēsu o kowashite mo ii desu ka?', 'Puis-je casser la vitrine ?',
            "こわす = casser 😱 ! Montrez simplement la figurine : « これ、みせて ください »."),
          ko('あけまして おめでとう！', 'Akemashite omedetō!', 'Bonne année !',
            "Ça ressemble à あける (ouvrir), mais c'est « Bonne année » ! Montrez la figurine : « これ、みせて ください »."),
        ],
      },
      {
        id: 'fig_2s',
        kana: 'はい、 どうぞ。 ちゅうこですが、 みかいふうですよ。',
        romaji: 'Hai, dōzo. Chūko desu ga, mikaifū desu yo.',
        fr: "Voici. C'est de l'occasion, mais elle n'a jamais été ouverte.",
        choices: [
          ok('いくらですか？', 'Ikura desu ka?', "C'est combien ?",
            "Parfait ! « いくらですか » marche partout. Le vendeur vous a dit みかいふう = jamais ouvert (scellé), un mot clé pour les collectionneurs : une figurine « ちゅうこ » peut très bien être みかいふう."),
          ko('にせものを ください。', 'Nisemono o kudasai.', "Une contrefaçon, s'il vous plaît.",
            "にせもの = contrefaçon ! Demandez plutôt le prix : « いくらですか？ »."),
          ko('ぜんぶ さわります。', 'Zenbu sawarimasu.', 'Je vais tout toucher.',
            "Mauvaise idée ! Demandez plutôt le prix : « いくらですか？ »."),
        ],
      },
      {
        id: 'fig_3s',
        kana: 'はっせんえんです。',
        romaji: 'Hassen-en desu.',
        fr: "C'est 8 000 yens.",
        choices: [
          ok('じゃあ、 これ ください。', 'Jā, kore kudasai.', 'Bon, je prends celle-ci.',
            "Parfait ! « これ ください » : le combo le plus utile du shopping. はっせん = 8 000 (はち + せん). Les prix sont fixes, on ne marchande pas."),
          ko('たかいですね。 ごひゃくえんに して！', 'Takai desu ne. Gohyaku-en ni shite!', "C'est cher. Mettez-la à 500 yens !",
            "On ne marchande pas dans les magasins japonais (et c'est familier). Pour la prendre : « これ ください »."),
          ko('はちじに きます。', 'Hachi-ji ni kimasu.', 'Je viendrai à 8 heures.',
            "はちじ = 8 heures ! はっせんえん = 8 000 yens. Pour la prendre : « じゃあ、これ ください »."),
        ],
      },
    ],
    outro: {
      id: 'fig_end2',
      kana: 'ありがとうございます。 レジへ どうぞ。',
      romaji: 'Arigatō gozaimasu. Reji e dōzo.',
      fr: 'Merci. Passez en caisse, je vous prie.',
    },
    tip: "Dans les quartiers otaku, comparez les prix entre boutiques : une même figurine peut varier du simple au double selon l'état de la boîte. Repérez みかいふう (scellée) et せいきひん (produit officiel).",
  },

  /* ───────────────────────────── 9. PHARMACIE ───────────────────────────── */
  pharmacy: {
    id: 'pharmacy',
    title: 'Pharmacie : mal de tête & mal de ventre',
    goal: 'Décrivez vos symptômes, montrez où vous avez mal et obtenez un médicament adapté.',
    steps: [
      {
        id: 'pha_1',
        kana: 'いらっしゃいませ。 どう されましたか？',
        romaji: 'Irasshaimase. Dō saremashita ka?',
        fr: "Bonjour. Qu'est-ce qui ne va pas ?",
        night: { kana: 'こんばんは。 どう されましたか？', romaji: 'Konbanwa. Dō saremashita ka?', fr: "Bonsoir. Qu'est-ce qui ne va pas ?" },
        choices: [
          ok('あたまが いたいです。', 'Atama ga itai desu.', "J'ai mal à la tête.",
            "Parfait ! [partie du corps] が いたいです = « j'ai mal à… ». あたま = tête, おなか = ventre, のど = gorge, は = dents. La pharmacienne s'occupe du reste."),
          ko('あたまが いいです。', 'Atama ga ii desu.', 'Je suis intelligent.',
            "あたまが いい = être intelligent 🧠 ! Pour la douleur : あたまが いたい."),
          ko('いたいです、 あなたは。', 'Itai desu, anata wa.', 'Vous êtes douloureux.',
            "C'est vous qui avez mal ! Et あなた est rarement utilisé. Dites : « あたまが いたいです »."),
        ],
      },
      {
        id: 'pha_2',
        kana: 'いつから いたいですか？',
        romaji: 'Itsu kara itai desu ka?',
        fr: 'Depuis quand avez-vous mal ?',
        vars: [{ kana: 'いたみは いつからですか？', romaji: 'Itami wa itsu kara desu ka?', fr: 'La douleur, c’est depuis quand ?' }],
        choices: [
          ok('きのうの よるからです。', 'Kinō no yoru kara desu.', 'Depuis hier soir.',
            "Bien ! 〜から = depuis. きのう (hier), けさ (ce matin), みっかまえ (il y a 3 jours)."),
          ko('あしたからです。', 'Ashita kara desu.', 'À partir de demain.',
            "あした = demain ! Pour le passé : きのう (hier)."),
          ko('いつも げんきです。', 'Itsumo genki desu.', 'Je suis toujours en forme.',
            "Contradictoire avec votre mal de tête 😄. Indiquez quand ça a commencé : « きのうの よるからです »."),
        ],
      },
      {
        id: 'pha_3',
        kana: 'ほかに しょうじょうは ありますか？',
        romaji: 'Hoka ni shōjō wa arimasu ka?',
        fr: 'Avez-vous d\'autres symptômes ?',
        choices: [
          ok('おなかも いたいです。', 'Onaka mo itai desu.', "J'ai aussi mal au ventre.",
            "Excellent : も = aussi. Montrer l'endroit du doigt en disant « ここ » (ici) aide aussi énormément. La pharmacienne pourra adapter le traitement."),
          ko('おなかが すきました。', 'Onaka ga sukimashita.', "J'ai faim.",
            "Classique ! おなかが すいた = avoir faim ; おなかが いたい = avoir mal au ventre."),
          ko('しょうじょは どこですか？', 'Shōjo wa doko desu ka?', 'Où est la jeune fille ?',
            "しょうじょ = jeune fille ; しょうじょう = symptôme. La voyelle longue compte !"),
        ],
      },
      {
        id: 'pha_4',
        kana: 'アレルギーは ありますか？',
        romaji: 'Arerugī wa arimasu ka?',
        fr: 'Avez-vous des allergies ?',
        vars: [{ kana: 'おくすりの アレルギーは ございますか？', romaji: 'Okusuri no arerugī wa gozaimasu ka?', fr: 'Avez-vous des allergies aux médicaments ?' }],
        choices: [
          ok('いいえ、 ありません。', 'Iie, arimasen.', 'Non, aucune.',
            "Parfait. Sinon : « 〜の アレルギーが あります ». Préparez la liste de vos allergies et traitements en japonais avant le voyage."),
          ko('はい、 アレルギーが すきです。', 'Hai, arerugī ga suki desu.', "Oui, j'aime les allergies.",
            "すき = aimer 😅. Répondez « いいえ、ありません » ou nommez l'allergie."),
          ko('アレルギーを ください。', 'Arerugī o kudasai.', 'Donnez-moi une allergie.',
            "Personne ne veut ça ! Répondez à la question : « いいえ、ありません »."),
        ],
      },
    ],
    outro: {
      id: 'pha_end',
      kana: 'では、 こちらの くすりを どうぞ。 しょくごに いちじょう のんで ください。 おだいじに！',
      romaji: 'Dewa, kochira no kusuri o dōzo. Shokugo ni ichijō nonde kudasai. O-daiji ni!',
      fr: 'Voici ce médicament. Prenez un comprimé après le repas. Prenez soin de vous !',
    },
    tip: "Urgences au Japon : 119 (ambulance / pompiers), 110 (police). Et un médicament se « boit » (のむ) en japonais, même en comprimé.",
  },

  /* ───────────────────────────── 10. IZAKAYA (la nuit) ───────────────────────────── */
  izakaya: {
    id: 'izakaya',
    title: 'Izakaya : boire un verre le soir',
    goal: 'Le soir, entrez dans un izakaya : annoncez le nombre de personnes, commandez à boire et à manger, puis réglez l’addition.',
    steps: [
      {
        id: 'iza_1',
        kana: 'こんばんは！ いらっしゃいませ！ なんめいさまですか？',
        romaji: 'Konbanwa! Irasshaimase! Nan-mei sama desu ka?',
        fr: 'Bonsoir ! Bienvenue ! Vous êtes combien ?',
        qty: { what: ['personne', 'personnes'], min: 1, max: 5, def: 2 },
        choices: [
          { ...ok('{nin}です。', '{nin} desu.', 'Nous sommes {n}.',
            "Parfait ! ひとり (1), ふたり (2), さんにん (3), よにん (4), ごにん (5)… Montrer les doigts en même temps aide beaucoup dans le brouhaha d'un izakaya."),
            alt: { 1: { fr: 'Je suis seul·e.', feedback: "Très bien ! Seul·e, on vous installera souvent au comptoir (カウンター), la meilleure place pour voir le patron cuisiner." } } },
          ko('{tsu}です。', '{tsu} desu.', '{n} (objets).',
            "Presque ! ひとつ, ふたつ… comptent des objets (deux bières…). Pour des personnes : ひとり, ふたり, さんにん, よにん, ごにん."),
          ko('{ji}です。', '{ji} desu.', 'Il est {n} heure{s}.',
            "〜じ donne l'heure (にじ = 2 h) ! Pour dire combien vous êtes : ひとり, ふたり, さんにん…"),
        ],
      },
      {
        id: 'iza_2',
        kana: 'おのみものは なにに しますか？',
        romaji: 'O-nomimono wa nani ni shimasu ka?',
        fr: 'Qu’est-ce que vous prenez à boire ?',
        vars: [{ kana: 'おのみもの、 どう されますか？', romaji: 'O-nomimono, dō saremasu ka?', fr: 'Et pour boire, ce sera quoi ?' }, { kana: 'まず おのみものから うかがいます！', romaji: 'Mazu o-nomimono kara ukagaimasu!', fr: 'Je prends d’abord les boissons !' }],
        choices: [
          ok('とりあえず なまビールで！', 'Toriaezu nama bīru de!', 'Une pression pour commencer !',
            "La phrase culte des izakaya ! とりあえず = « pour commencer / en attendant », なまビール = bière pression. Tout le monde trinque ensuite : « かんぱい！ »."),
          ok('ウーロンちゃ おねがいします。', 'Ūroncha onegai shimasu.', 'Un thé oolong, s’il vous plaît.',
            "Parfait sans alcool : le thé oolong froid est la boisson sans alcool n°1 des izakaya. Personne ne vous forcera à boire."),
          ko('ビールを たべます。', 'Bīru o tabemasu.', 'Je mange une bière.',
            "Une bière se boit (のむ), elle ne se mange pas (たべる) ! Ici, dites simplement « なまビールで » ou « なまビール、おねがいします »."),
        ],
      },
      {
        id: 'iza_3',
        kana: 'ごちゅうもんは おきまりですか？',
        romaji: 'Go-chūmon wa o-kimari desu ka?',
        fr: 'Vous avez choisi votre commande ?',
        choices: [
          ok('やきとりと えだまめを おねがいします。', 'Yakitori to edamame o onegai shimasu.', 'Des yakitori et des edamame, s’il vous plaît.',
            "Excellent ! 〜と〜 = « … et … ». Les plats arrivent au fur et à mesure, à partager : on recommande quand on veut."),
          ko('ごちそうさまでした。', 'Gochisōsama deshita.', 'Merci pour le repas (à la fin).',
            "Trop tôt 😄 : on dit ごちそうさまでした en partant, après avoir mangé. Pour commander : « [plat] を おねがいします »."),
          ko('おきまりです。', 'O-kimari desu.', 'C’est décidé (?)',
            "Vous répétez la question ! Annoncez plutôt les plats : « やきとりと えだまめを おねがいします »."),
        ],
      },
      {
        id: 'iza_4',
        kana: 'おかいけいは ごいっしょで よろしいですか？',
        romaji: 'O-kaikei wa go-issho de yoroshii desu ka?',
        fr: 'Pour l’addition, on fait tout ensemble ?',
        choices: [
          ok('べつべつで おねがいします。', 'Betsubetsu de onegai shimasu.', 'Séparément, s’il vous plaît.',
            "Parfait ! べつべつ = séparément. Pour demander l'addition vous-même : « おかいけい おねがいします » (ou faites un petit ✕ avec les index)."),
          ok('いっしょに おねがいします。', 'Issho ni onegai shimasu.', 'Tout ensemble, s’il vous plaît.',
            "Très bien ! いっしょ = ensemble. Au Japon, souvent une seule personne règle puis on partage entre amis."),
          ko('チップは いくらですか？', 'Chippu wa ikura desu ka?', 'Combien de pourboire ?',
            "Pas de pourboire au Japon ! Laisser de l'argent peut même gêner. En revanche, une petite entrée (おとおし) est souvent facturée d'office."),
        ],
      },
    ],
    outro: {
      id: 'iza_end',
      kana: 'ありがとうございました！ また おこしください！',
      romaji: 'Arigatō gozaimashita! Mata o-koshi kudasai!',
      fr: 'Merci beaucoup ! Revenez quand vous voulez !',
    },
    tip: "おとおし (otōshi) : la petite entrée servie d'office est facturée (300 à 500 ¥), c'est normal. Et en partant, lancez un joyeux « ごちそうさまでした ! » au patron.",
  },

  /* ───────────────────────────── 11. BOULANGERIE ───────────────────────────── */
  bakery: {
    id: 'bakery',
    title: 'Boulangerie : commander des quantités',
    goal: 'Commandez des melon pan, des cafés et des brioches en choisissant vous-même les quantités, puis dites si c’est à emporter.',
    steps: [
      {
        id: 'bak_1',
        kana: 'いらっしゃいませ！ やきたて ですよ。 なにに しますか？',
        romaji: 'Irasshaimase! Yakitate desu yo. Nani ni shimasu ka?',
        fr: 'Bienvenue ! Tout juste sorti du four. Qu’est-ce que ce sera ?',
        qty: { what: ['melon pan', 'melon pan'], min: 1, max: 5, def: 3 },
        choices: [
          ok('メロンパンを {tsu} ください。', 'Meronpan o {tsu} kudasai.', '{n} melon pan, s’il vous plaît.',
            "Parfait ! Article + を + nombre + ください. Les petits objets se comptent avec 〜つ : ひとつ, ふたつ, みっつ, よっつ, いつつ. Le nombre se place juste avant ください, sans particule."),
          ko('メロンを {tsu} ください。', 'Meron o {tsu} kudasai.', '{n} melon{s}, s’il vous plaît.',
            "メロン tout court, c'est le fruit (et il coûte très cher au Japon 😅) ! Le petit pain sucré, c'est メロンパン."),
          ko('メロンパンを {nin} ください。', 'Meronpan o {nin} kudasai.', '{n} personne{s} de melon pan, s’il vous plaît.',
            "ひとり, ふたり, さんにん… comptent les personnes. Pour des pains : ひとつ, ふたつ, みっつ…"),
        ],
      },
      {
        id: 'bak_2',
        qtyFrom: 'bak_1',
        kana: 'メロンパン {tsu}ですね。 おのみものは いかがですか？',
        romaji: 'Meronpan {tsu} desu ne. O-nomimono wa ikaga desu ka?',
        fr: '{n} melon pan, c’est noté. Et avec ça, une boisson ?',
        qty: { what: ['café', 'cafés'], min: 1, max: 5, def: 4 },
        choices: [
          ok('コーヒーを {tsu} おねがいします。', 'Kōhī o {tsu} onegai shimasu.', '{n} café{s}, s’il vous plaît.',
            "Très bien ! Au comptoir, on compte les cafés à emporter comme des objets : ひとつ, ふたつ… (le compteur des tasses, 〜はい, existe aussi : いっぱい, にはい, さんばい)."),
          ko('コーヒーを {ji}に おねがいします。', 'Kōhī o {ji} ni onegai shimasu.', 'Du café à {n} heure{s}, s’il vous plaît.',
            "〜じ, c'est l'heure (よじ = 4 h) ! Pour une quantité : ひとつ, ふたつ, みっつ, よっつ, いつつ."),
          ko('コピーを {tsu} おねがいします。', 'Kopī o {tsu} onegai shimasu.', '{n} photocopie{s}, s’il vous plaît.',
            "コピー = photocopie ! Attention à la voyelle longue : コーヒー (kōhī), avec deux traits ー."),
        ],
      },
      {
        id: 'bak_3',
        qtyFrom: 'bak_2',
        kana: 'コーヒー {tsu}ですね。 ほかに なにか ございますか？',
        romaji: 'Kōhī {tsu} desu ne. Hoka ni nanika gozaimasu ka?',
        fr: '{n} café{s}, très bien. Autre chose ?',
        qty: { what: ['brioche', 'brioches'], min: 1, max: 5, def: 2 },
        choices: [
          ok('ブリオッシュも {tsu} ください。', 'Buriosshu mo {tsu} kudasai.', '{n} brioche{s} aussi, s’il vous plaît.',
            "Excellent ! も = « aussi » : on ajoute à la commande. Toujours le même compteur pour les pains : ひとつ, ふたつ, みっつ…"),
          ko('ブリオッシュも {mai} ください。', 'Buriosshu mo {mai} kudasai.', '{n} feuille{s} de brioche aussi.',
            "〜まい compte les objets plats (billets, tickets, feuilles, T-shirts…). Une brioche, c'est ひとつ, ふたつ…"),
          ko('ブリオッシュも {hon} ください。', 'Buriosshu mo {hon} kudasai.', '{n} brioche{s} longue{s} (comme des bâtons).',
            "〜ほん compte les objets longs (bouteilles, parapluies, baguettes !). Pour une brioche ronde : ひとつ, ふたつ…"),
        ],
      },
      {
        id: 'bak_4',
        qtyFrom: 'bak_3',
        kana: 'ブリオッシュ {tsu}ですね。 こちらで おめしあがりですか？',
        romaji: 'Buriosshu {tsu} desu ne. Kochira de o-meshiagari desu ka?',
        fr: '{n} brioche{s}, entendu. C’est pour manger ici ?',
        choices: [
          ok('いいえ、 もちかえりで おねがいします。', 'Iie, mochikaeri de onegai shimasu.', 'Non, à emporter s’il vous plaît.',
            "Parfait ! もちかえり = à emporter (« porter en rentrant »). On entend aussi テイクアウト."),
          ok('はい、 ここで たべます。', 'Hai, koko de tabemasu.', 'Oui, je mange ici.',
            "Très bien ! Sur place (てんないで), le prix peut changer un peu : la TVA est de 10 % sur place contre 8 % à emporter."),
          ko('いいえ、 もちろんです。', 'Iie, mochiron desu.', 'Non, bien sûr que oui.',
            "もちろん (bien sûr) ressemble à もちかえり (à emporter) mais ça ne veut rien dire ici ! Et « いいえ » + « もちろん » se contredisent."),
        ],
      },
    ],
    outro: {
      id: 'bak_end',
      kana: 'ありがとうございました！ また おこしください！',
      romaji: 'Arigatō gozaimashita! Mata o-koshi kudasai!',
      fr: 'Merci beaucoup ! À bientôt !',
    },
    tip: "Dans les boulangeries japonaises, on se sert soi-même : prenez un plateau (トレー) et une pince (トング), choisissez vos pains puis apportez le plateau à la caisse. Ne touchez jamais le pain avec les doigts !",
  },

  /* ───────────────────────────── 12. HÔTEL ───────────────────────────── */
  hotel: {
    id: 'hotel',
    title: 'Hôtel : check-in & petit-déjeuner',
    goal: 'Faites votre check-in, présentez votre passeport, puis demandez l’heure du petit-déjeuner.',
    steps: [
      {
        id: 'hot_1',
        kana: 'いらっしゃいませ。 チェックインですか？',
        romaji: 'Irasshaimase. Chekku-in desu ka?',
        fr: 'Bienvenue. C’est pour un check-in ?',
        vars: [{ kana: 'いらっしゃいませ。 ごよやくの おきゃくさまですか？', romaji: 'Irasshaimase. Go-yoyaku no o-kyaku-sama desu ka?', fr: 'Bienvenue. Vous avez une réservation ?' }],
        night: { kana: 'こんばんは。 チェックインですか？', romaji: 'Konbanwa. Chekku-in desu ka?', fr: 'Bonsoir. C’est pour un check-in ?' },
        choices: [
          ok('はい、 よやくした デュボアです。', 'Hai, yoyaku shita Dyubowa desu.', 'Oui, j’ai réservé, au nom de Dubois.',
            "Parfait ! « よやくした + nom + です » = « je suis X, j’ai réservé ». Remplacez デュボア par votre nom en katakana. Montrer la confirmation sur le téléphone aide aussi."),
          ko('はい、 よやくを ください。', 'Hai, yoyaku o kudasai.', 'Oui, donnez-moi une réservation.',
            "On ne « demande » pas une réservation qu’on a déjà ! Dites que vous avez réservé : « よやくした + votre nom + です »."),
          ko('チェックアウトです。', 'Chekku-auto desu.', 'C’est pour le check-out.',
            "Vous arrivez : c’est un check-in (チェックイン). Le check-out (チェックアウト), c’est le jour du départ."),
        ],
      },
      {
        id: 'hot_2',
        kana: 'パスポートを おねがいします。',
        romaji: 'Pasupōto o onegai shimasu.',
        fr: 'Votre passeport, s’il vous plaît.',
        vars: [{ kana: 'パスポートを はいけん できますか？', romaji: 'Pasupōto o haiken dekimasu ka?', fr: 'Puis-je voir votre passeport ?' }],
        choices: [
          ok('はい、 どうぞ。', 'Hai, dōzo.', 'Oui, tenez.',
            "Très bien. « どうぞ » accompagne tout ce qu’on tend. Au Japon, l’hôtel doit légalement copier le passeport des touristes étrangers : c’est normal."),
          ko('いいえ、 けっこうです。', 'Iie, kekkō desu.', 'Non merci.',
            "« けっこうです » sert à refuser poliment… mais ici le passeport est obligatoire (la loi l’exige pour les touristes). Tendez-le avec « はい、どうぞ »."),
          ko('パスタを おねがいします。', 'Pasuta o onegai shimasu.', 'Des pâtes, s’il vous plaît.',
            "パスタ (pâtes) ≠ パスポート (passeport) 😄. Ici, on vous le demande : tendez-le avec « はい、どうぞ »."),
        ],
      },
      {
        id: 'hot_3',
        kana: 'おへやは ごまるにごうしつです。 なにか ごしつもんは ありますか？',
        romaji: 'O-heya wa go-maru-ni gōshitsu desu. Nanika go-shitsumon wa arimasu ka?',
        fr: 'Votre chambre est la 502. Avez-vous des questions ?',
        choices: [
          ok('ちょうしょくは なんじからですか？', 'Chōshoku wa nanji kara desu ka?', 'Le petit-déjeuner est à partir de quelle heure ?',
            "Excellent ! なんじから = à partir de quelle heure, なんじまで = jusqu’à quelle heure. ちょうしょく = petit-déjeuner. Les numéros de chambre se lisent chiffre par chiffre, 0 = まる : ご・まる・に = 502."),
          ko('ちょうしょくは いくつですか？', 'Chōshoku wa ikutsu desu ka?', 'Combien de petits-déjeuners (objets) ?',
            "いくつ = « combien (d’objets) ». Pour l’heure, demandez なんじ : « ちょうしょくは なんじからですか »."),
          ko('ごまるにです。', 'Go-maru-ni desu.', 'C’est 502.',
            "Vous répétez le numéro de la chambre, mais on vous demande si vous avez une question ! Par exemple : « ちょうしょくは なんじからですか »."),
        ],
      },
    ],
    outro: {
      id: 'hot_end',
      kana: 'ちょうしょくは しちじから くじまでです。 ごゆっくり どうぞ。',
      romaji: 'Chōshoku wa shichi-ji kara ku-ji made desu. Go-yukkuri dōzo.',
      fr: 'Le petit-déjeuner est servi de 7 h à 9 h. Bon séjour.',
    },
    tip: "Le check-in est souvent à 15 h. Arrivé trop tôt ? « にもつを あずけて いいですか » (je peux vous laisser mes bagages ?) : presque tous les hôtels les gardent gratuitement. Pas de pourboire, jamais.",
  },

  /* ───────────────────────────── 13. RESTAURANT À TICKETS ───────────────────────────── */
  shokudo: {
    id: 'shokudo',
    title: 'Restaurant à tickets : le しょっけんき',
    goal: 'On vous envoie au distributeur de tickets : demandez comment il marche, vérifiez qu’il prend les gros billets, puis choisissez la taille de votre riz.',
    steps: [
      {
        id: 'sho_1',
        kana: 'いらっしゃいませ！ さきに しょっけんきで チケットを かって ください。',
        romaji: 'Irasshaimase! Saki ni shokkenki de chiketto o katte kudasai.',
        fr: 'Bienvenue ! Achetez d’abord un ticket au distributeur, s’il vous plaît.',
        vars: [{ kana: 'いらっしゃいませ！ しょっけんきは あちらです。', romaji: 'Irasshaimase! Shokkenki wa achira desu.', fr: 'Bienvenue ! Le distributeur de tickets est là-bas.' }],
        choices: [
          ok('すみません、 つかいかたが わかりません。', 'Sumimasen, tsukaikata ga wakarimasen.', 'Excusez-moi, je ne sais pas comment l’utiliser.',
            "Parfait ! Verbe + かた = « la façon de… » : つかいかた (s’en servir), かいかた (acheter), のりかた (prendre un transport). « 〜が わかりません » vous sauvera souvent."),
          ko('チケットを たべます。', 'Chiketto o tabemasu.', 'Je mange le ticket.',
            "Le ticket ne se mange pas 😄 : on le donne au personnel, qui apporte le plat. Si vous êtes perdu : « つかいかたが わかりません »."),
          ko('きっぷを ください。', 'Kippu o kudasai.', 'Un billet de train, s’il vous plaît.',
            "きっぷ = billet de transport. Ici on parle d’un ticket repas (しょっけん). Et c’est la machine qui le vend, pas la serveuse."),
        ],
      },
      {
        id: 'sho_2',
        kana: 'おかねを いれて、 ボタンを おして ください。 えいごの ボタンも ありますよ。',
        romaji: 'O-kane o irete, botan o oshite kudasai. Eigo no botan mo arimasu yo.',
        fr: 'Mettez l’argent, puis appuyez sur le bouton. Il y a aussi un bouton en anglais.',
        choices: [
          ok('いちまんえんさつは つかえますか？', 'Ichiman-en satsu wa tsukaemasu ka?', 'Les billets de 10 000 yens, ça marche ?',
            "Très utile ! Beaucoup de machines n’acceptent que les billets de 1 000 ¥. 〜は つかえますか = « est-ce qu’on peut utiliser… ? » (marche aussi pour la carte : カードは つかえますか)."),
          ko('ボタンを ください。', 'Botan o kudasai.', 'Donnez-moi un bouton.',
            "On ne demande pas le bouton, on appuie dessus (おす). Une vraie question utile : « いちまんえんさつは つかえますか »."),
          ko('おして ください。', 'Oshite kudasai.', 'Appuyez, s’il vous plaît.',
            "Vous demandez à la serveuse d’appuyer à votre place ! おして ください, c’est ce qu’elle vous dit à vous."),
        ],
      },
      {
        id: 'sho_3',
        kana: 'チケットを おあずかりします。 ごはんの おおもりは むりょうです。 いかがですか？',
        romaji: 'Chiketto o o-azukari shimasu. Gohan no ōmori wa muryō desu. Ikaga desu ka?',
        fr: 'Je prends votre ticket. Le riz en grande portion est gratuit. Ça vous dit ?',
        choices: [
          ok('はい、 おおもりで おねがいします。', 'Hai, ōmori de onegai shimasu.', 'Oui, en grande portion s’il vous plaît.',
            "Parfait ! おおもり = grande portion, なみ / ふつう = normale, すくなめ = un peu moins. むりょう = gratuit, un mot à repérer partout."),
          ok('いいえ、 ふつうで いいです。', 'Iie, futsū de ii desu.', 'Non, une portion normale, ça ira.',
            "Très bien ! 〜で いいです = « … ça me va ». ふつう = normal. Pour un peu moins : すくなめで おねがいします."),
          ko('いいえ、 おもいです。', 'Iie, omoi desu.', 'Non, c’est lourd.',
            "おもい = lourd ! Ça ressemble à おおもり (grande portion). Répondez « おおもりで » ou « ふつうで »."),
        ],
      },
    ],
    outro: {
      id: 'sho_end',
      kana: 'おまたせしました。 しょうがやき ていしょくです。 ごゆっくり どうぞ。',
      romaji: 'O-matase shimashita. Shōgayaki teishoku desu. Go-yukkuri dōzo.',
      fr: 'Désolée pour l’attente. Voici votre menu porc au gingembre. Bon appétit.',
    },
    tip: "Sur un しょっけんき, le plat phare est presque toujours en haut à gauche, souvent avec une photo. L’eau est gratuite et en libre-service, et dans les petits restos on ramène parfois son plateau au comptoir.",
  },

  /* ───────────────────────────── 14. KŌBAN ───────────────────────────── */
  koban: {
    id: 'koban',
    title: 'Kōban : déclarer un objet perdu',
    goal: 'Vous avez perdu votre portefeuille : dites-le, expliquez où, puis décrivez-le.',
    steps: [
      {
        id: 'kob_1',
        kana: 'どう しましたか？',
        romaji: 'Dō shimashita ka?',
        fr: 'Qu’est-ce qui vous arrive ?',
        vars: [{ kana: 'はい、 どう されましたか？', romaji: 'Hai, dō saremashita ka?', fr: 'Oui, que se passe-t-il ?' }],
        choices: [
          ok('さいふを なくしました。', 'Saifu o nakushimashita.', 'J’ai perdu mon portefeuille.',
            "Parfait ! Objet + を なくしました = « j’ai perdu… ». スマホ, パスポート, かぎ (clés) : la phrase marche pour tout."),
          ko('さいふを なきました。', 'Saifu o nakimashita.', 'J’ai pleuré mon portefeuille.',
            "なく = pleurer ! Perdre, c’est なくす → なくしました. Une seule syllabe change tout."),
          ko('さいふを ください。', 'Saifu o kudasai.', 'Donnez-moi un portefeuille.',
            "Le kōban ne vend pas de portefeuilles 😄. Dites ce qui s’est passé : « さいふを なくしました »."),
        ],
      },
      {
        id: 'kob_2',
        kana: 'どこで なくしましたか？',
        romaji: 'Doko de nakushimashita ka?',
        fr: 'Où l’avez-vous perdu ?',
        choices: [
          ok('たぶん えきの ちかくです。', 'Tabun eki no chikaku desu.', 'Sans doute près de la gare.',
            "Très bien ! たぶん = sans doute, 〜の ちかく = près de… Si vous ne savez pas du tout : « わかりません »."),
          ko('きのうです。', 'Kinō desu.', 'Hier.',
            "On vous demande où (どこ), pas quand (いつ). Pour un lieu : « えきの ちかくです »."),
          ko('えきへ いきます。', 'Eki e ikimasu.', 'Je vais à la gare.',
            "Vous annoncez où vous allez, pas où vous l’avez perdu. Dites : « たぶん えきの ちかくです »."),
        ],
      },
      {
        id: 'kob_3',
        kana: 'どんな さいふですか？',
        romaji: 'Donna saifu desu ka?',
        fr: 'C’est quel genre de portefeuille ?',
        choices: [
          ok('くろい かわの さいふです。', 'Kuroi kawa no saifu desu.', 'Un portefeuille noir en cuir.',
            "Parfait ! Couleurs utiles : くろい (noir), しろい (blanc), あかい (rouge), あおい (bleu), ちゃいろい (marron). かわ = cuir."),
          ko('おおきい さいふが ほしいです。', 'Ōkii saifu ga hoshii desu.', 'Je voudrais un grand portefeuille.',
            "ほしい = vouloir avoir. On ne vous propose pas d’en acheter un : décrivez le vôtre, « くろい かわの さいふです »."),
          ko('くろい ねこです。', 'Kuroi neko desu.', 'C’est un chat noir.',
            "ねこ = chat 😄. Gardez la couleur et nommez l’objet : « くろい かわの さいふです »."),
        ],
      },
    ],
    outro: {
      id: 'kob_end',
      kana: 'では、 この かみに なまえと でんわばんごうを かいて ください。 みつかったら れんらく します。',
      romaji: 'Dewa, kono kami ni namae to denwa bangō o kaite kudasai. Mitsukattara renraku shimasu.',
      fr: 'Alors, écrivez votre nom et votre numéro de téléphone sur ce papier. On vous contacte si on le retrouve.',
    },
    tip: "Au Japon, les objets perdus sont très souvent rapportés, argent compris. Le こうばん (petit poste de police) sert aussi à demander son chemin. Oublié dans un train ? Cherchez le guichet わすれもの (objets oubliés) de la gare.",
  },

  /* ───────────────────────────── 15. DEMANDER SON CHEMIN ───────────────────────────── */
  michi: {
    id: 'michi',
    title: 'Dans la rue : demander son chemin',
    goal: 'Interpellez une passante, demandez s’il y a un hôtel près d’ici, vérifiez l’itinéraire, puis remerciez.',
    steps: [
      {
        id: 'mic_1',
        kana: 'はい、 なんでしょう？',
        romaji: 'Hai, nan deshō?',
        fr: 'Oui, je peux vous aider ?',
        vars: [{ kana: 'はい？ どう しました？', romaji: 'Hai? Dō shimashita?', fr: 'Oui ? Que se passe-t-il ?' }],
        choices: [
          ok('すみません、 この ちかくに ホテルは ありますか？', 'Sumimasen, kono chikaku ni hoteru wa arimasu ka?', 'Excusez-moi, il y a un hôtel près d’ici ?',
            "Parfait ! « この ちかくに 〜は ありますか » = « y a-t-il un … près d’ici ? ». Ça marche avec コンビニ, トイレ, えき, ATM…"),
          ko('ホテルは なんですか？', 'Hoteru wa nan desu ka?', 'Qu’est-ce qu’un hôtel ?',
            "なん = quoi. Vous demandez la définition d’un hôtel 😄. Pour un lieu : « この ちかくに ホテルは ありますか »."),
          ko('ホテルに なりたいです。', 'Hoteru ni naritai desu.', 'Je voudrais devenir un hôtel.',
            "〜に なりたい = vouloir devenir… Demandez plutôt : « この ちかくに ホテルは ありますか »."),
        ],
      },
      {
        id: 'mic_2',
        kana: 'ありますよ。 この みちを まっすぐ いって、 つきあたりの ひだりがわです。',
        romaji: 'Arimasu yo. Kono michi o massugu itte, tsukiatari no hidari-gawa desu.',
        fr: 'Oui. Prenez cette rue tout droit, c’est tout au bout, sur la gauche.',
        choices: [
          ok('まっすぐ いって、 ひだりですね。', 'Massugu itte, hidari desu ne.', 'Tout droit, puis à gauche, c’est bien ça ?',
            "Excellent réflexe : répéter avec 〜ですね pour vérifier. まっすぐ = tout droit, ひだり = gauche, みぎ = droite, つきあたり = au bout de la rue."),
          ko('まっすぐ いって、 みぎですね。', 'Massugu itte, migi desu ne.', 'Tout droit, puis à droite, c’est ça ?',
            "Attention : みぎ = droite. Elle a dit ひだり (gauche) !"),
          ko('みちを ください。', 'Michi o kudasai.', 'Donnez-moi la rue.',
            "みち = la rue, le chemin, mais on ne le « demande » pas avec ください. Vérifiez plutôt : « まっすぐ いって、ひだりですね »."),
        ],
      },
      {
        id: 'mic_3',
        kana: 'そうです。 あるいて ごふんぐらいですよ。',
        romaji: 'Sō desu. Aruite go-fun gurai desu yo.',
        fr: 'C’est ça. C’est à environ 5 minutes à pied.',
        choices: [
          ok('ごしんせつに ありがとうございます。', 'Go-shinsetsu ni arigatō gozaimasu.', 'Merci beaucoup pour votre gentillesse.',
            "Superbe ! Un merci très poli et chaleureux. Un simple « ありがとうございます » marche aussi très bien."),
          ko('ごふんを ください。', 'Go-fun o kudasai.', 'Donnez-moi cinq minutes.',
            "ごふん = cinq minutes de marche, elle vous informe ! Il ne reste qu’à remercier : « ありがとうございます »."),
          ko('すみません、 あるきません。', 'Sumimasen, arukimasen.', 'Désolé, je ne marche pas.',
            "あるきません = je ne marche pas… Un peu étrange après avoir demandé votre chemin ! Remerciez simplement."),
        ],
      },
    ],
    outro: {
      id: 'mic_end',
      kana: 'いいえ。 きを つけて！',
      romaji: 'Iie. Ki o tsukete!',
      fr: 'Je vous en prie. Bonne route !',
    },
    tip: "Les rues japonaises n’ont presque jamais de nom : montrez la carte sur votre téléphone en disant « ここに いきたいです » (je veux aller ici). Les gens vous accompagnent parfois jusqu’au bout. Sinon, demandez au kōban.",
  },
};

/* ─────────────────────────────── Utilitaires ─────────────────────────────── */

/** id audio de la bonne réponse du joueur pour une étape */
export const replyId = (stepId: string) => `${stepId}_r`;

export const getCorrectChoice = (step: Step): Choice => step.choices.find((c) => c.correct) ?? step.choices[0];

/** id audio d'une bonne réponse : `{id}_r` pour la première, `{id}_r2`, `_r3`… pour les autres */
export const choiceVoiceId = (step: Step, c: Choice) => {
  const k = step.choices.filter((x) => x.correct).indexOf(c);
  return k <= 0 ? replyId(step.id) : `${replyId(step.id)}${k + 1}`;
};

/** id audio de la variante du soir */
export const nightId = (id: string) => `${id}_n`;

/** réplique adaptée à l'heure : variante 🌙 si elle existe, sinon « Bonjour » → « Bonsoir » */
export function atTime<T extends Line>(line: T, night: boolean): T & { voice: string } {
  if (!night) return { ...line, voice: line.id };
  if (line.night) return { ...line, ...line.night, voice: nightId(line.id) };
  return { ...line, fr: line.fr.replace(/^Bonjour\b/, 'Bonsoir'), voice: line.id };
}

/** texte envoyé au moteur vocal (sans les espaces de lecture) */
export const speechText = (l: { kana: string; tts?: string }) => (l.tts ?? l.kana).replace(/\s+/g, '');

/* ─────────────────────────────── Quantités ─────────────────────────────── */

export type Counter = 'tsu' | 'nin' | 'mei' | 'ji' | 'hon' | 'mai';

/** nombres 1 → 9 pour chaque compteur : [kana, romaji] */
export const COUNTERS: Record<Counter, [string, string][]> = {
  tsu: [['ひとつ', 'hitotsu'], ['ふたつ', 'futatsu'], ['みっつ', 'mittsu'], ['よっつ', 'yottsu'], ['いつつ', 'itsutsu'], ['むっつ', 'muttsu'], ['ななつ', 'nanatsu'], ['やっつ', 'yattsu'], ['ここのつ', 'kokonotsu']],
  nin: [['ひとり', 'hitori'], ['ふたり', 'futari'], ['さんにん', 'sannin'], ['よにん', 'yonin'], ['ごにん', 'gonin'], ['ろくにん', 'rokunin'], ['ななにん', 'nananin'], ['はちにん', 'hachinin'], ['きゅうにん', 'kyūnin']],
  mei: [['いちめい', 'ichi-mei'], ['にめい', 'ni-mei'], ['さんめい', 'san-mei'], ['よんめい', 'yon-mei'], ['ごめい', 'go-mei'], ['ろくめい', 'roku-mei'], ['ななめい', 'nana-mei'], ['はちめい', 'hachi-mei'], ['きゅうめい', 'kyū-mei']],
  ji: [['いちじ', 'ichiji'], ['にじ', 'niji'], ['さんじ', 'sanji'], ['よじ', 'yoji'], ['ごじ', 'goji'], ['ろくじ', 'rokuji'], ['しちじ', 'shichiji'], ['はちじ', 'hachiji'], ['くじ', 'kuji']],
  hon: [['いっぽん', 'ippon'], ['にほん', 'nihon'], ['さんぼん', 'sanbon'], ['よんほん', 'yonhon'], ['ごほん', 'gohon'], ['ろっぽん', 'roppon'], ['ななほん', 'nanahon'], ['はっぽん', 'happon'], ['きゅうほん', 'kyūhon']],
  mai: [['いちまい', 'ichimai'], ['にまい', 'nimai'], ['さんまい', 'sanmai'], ['よんまい', 'yonmai'], ['ごまい', 'gomai'], ['ろくまい', 'rokumai'], ['ななまい', 'nanamai'], ['はちまい', 'hachimai'], ['きゅうまい', 'kyūmai']],
};

const MARK = /\{(tsu|nin|mei|ji|hon|mai)\}/g;

function fillText(s: string, n: number, latin: boolean) {
  const out = s
    .replace(MARK, (_m, k: Counter) => COUNTERS[k][n - 1]?.[latin ? 1 : 0] ?? String(n))
    .replace(/\{n\}/g, String(n))
    .replace(/\{s\}/g, n > 1 ? 's' : '');
  return latin && /^\{/.test(s) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

/** remplace les marqueurs de quantité d'une réplique ou d'une réponse */
export function fillQty<T extends { kana: string; romaji: string; fr: string; tts?: string; feedback?: string; alt?: Record<number, Partial<QtyTexts>> }>(x: T, n: number): T {
  const o = { ...x, ...(x.alt?.[n] ?? {}) } as T;
  o.kana = fillText(o.kana, n, false);
  o.romaji = fillText(o.romaji, n, true);
  o.fr = fillText(o.fr, n, true);
  if (o.tts) o.tts = fillText(o.tts, n, false);
  if (o.feedback) o.feedback = fillText(o.feedback, n, false);
  return o;
}

/** id audio d'une variante chiffrée */
export const qtyId = (id: string, n: number | null) => (n == null ? id : `${id}_${n}`);

/** étape d'un scénario par son id */
export const findStep = (sc: Scenario, id: string) => sc.steps.find((s) => s.id === id);

/** quantités possibles pour une étape (ou la réplique qui reprend son nombre) */
export function qtyRange(sc: Scenario, stepId: string): number[] {
  const q = findStep(sc, stepId)?.qty;
  if (!q) return [];
  return Array.from({ length: q.max - q.min + 1 }, (_, i) => q.min + i);
}

/** valeur de départ du sélecteur (éventuellement reprise d'une étape précédente) */
export function qtyDefault(sc: Scenario, step: Step, chosen: Record<string, number>): number {
  const q = step.qty!;
  const v = typeof q.def === 'number' ? q.def : (chosen[q.def] ?? qtyDefault(sc, findStep(sc, q.def)!, chosen));
  return Math.min(q.max, Math.max(q.min, v));
}

/** nombre repris par une réplique `qtyFrom` */
export function qtyOf(sc: Scenario, stepId: string, chosen: Record<string, number>): number {
  const st = findStep(sc, stepId);
  return chosen[stepId] ?? (st?.qty ? qtyDefault(sc, st, chosen) : 1);
}

/** réplique prête à afficher / jouer : heure (jour / nuit) + quantité reprise */
export const varId = (id: string, v: number) => `${id}_v${v}`;

export function lineFor<T extends Line>(sc: Scenario, line: T, night: boolean, chosen: Record<string, number>, variant = 0): T & { voice: string } {
  const alt = variant > 0 && !line.qtyFrom && !(night && line.night) ? line.vars?.[variant - 1] : undefined;
  if (alt) return { ...atTime({ ...line, ...alt }, night), voice: varId(line.id, variant) };
  const t = atTime(line, night);
  if (!line.qtyFrom) return t;
  const n = qtyOf(sc, line.qtyFrom, chosen);
  return { ...fillQty(t, n), voice: qtyId(t.voice, n) };
}

export interface VoiceLine {
  id: string;
  scenarioId: string;
  speaker: 'npc' | 'player';
  kana: string;
  romaji: string;
  fr: string;
  text: string;
}

/** Toutes les répliques audio du jeu (PNJ + bonnes réponses du joueur), dans l'ordre. */
export function getAllVoiceLines(): VoiceLine[] {
  const out: VoiceLine[] = [];
  for (const sc of Object.values(SCENARIOS)) {
    const npc = (l: Line, id: string) => {
      if (!l.qtyFrom) {
        out.push({ id, scenarioId: sc.id, speaker: 'npc', kana: l.kana, romaji: l.romaji, fr: l.fr, text: speechText(l) });
        return;
      }
      for (const n of qtyRange(sc, l.qtyFrom)) {
        const f = fillQty(l, n);
        out.push({ id: qtyId(id, n), scenarioId: sc.id, speaker: 'npc', kana: f.kana, romaji: f.romaji, fr: f.fr, text: speechText(f) });
      }
    };
    for (const step of sc.steps) {
      npc(step, step.id);
      for (const c of step.choices.filter((x) => x.correct)) {
        const ns = step.qty ? qtyRange(sc, step.id) : [null];
        for (const n of ns) {
          const f = n == null ? c : fillQty(c, n);
          out.push({ id: qtyId(choiceVoiceId(step, c), n), scenarioId: sc.id, speaker: 'player', kana: f.kana, romaji: f.romaji, fr: f.fr, text: speechText(f) });
        }
      }
      const n = step.night;
      if (n) npc({ ...step, ...n }, nightId(step.id));
      step.vars?.forEach((v, i) => npc({ ...step, ...v }, varId(step.id, i + 1)));
    }
    npc(sc.outro, sc.outro.id);
  }
  return out;
}

/** toutes les variantes chiffrées d'une ligne (pour le dictionnaire romaji) */
export function allVariants<T extends { kana: string; romaji: string; fr: string; alt?: Record<number, Partial<QtyTexts>> }>(x: T): T[] {
  if (!/\{/.test(x.kana + x.romaji)) return [x];
  return Array.from({ length: 9 }, (_, i) => fillQty(x, i + 1));
}
