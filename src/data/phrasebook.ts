/**
 * Fiches d'aide générales du carnet : phrases « passe-partout » à savoir dire,
 * et mots qu'on entend partout et qu'il faut reconnaître à l'oreille.
 * Audio : public/audio/{id}.mp3 (généré avec `npm run generate-voices`),
 * sinon synthèse vocale du navigateur.
 */
import type { VoiceLine } from './scenarios';

export interface PhraseCard {
  id: string;
  kana: string;
  romaji: string;
  fr: string;
  /** quand / comment l'utiliser */
  when: string;
}

/** à savoir DIRE : elles sauvent dans toutes les situations */
export const MAGIC_PHRASES: PhraseCard[] = [
  { id: 'pb_sumimasen', kana: 'すみません', romaji: 'Sumimasen', fr: 'Excusez-moi / pardon', when: 'Pour appeler quelqu’un, commencer une demande ou s’excuser. Le mot n°1.' },
  { id: 'pb_onegai', kana: 'おねがいします', romaji: 'Onegai shimasu', fr: 'S’il vous plaît', when: 'Après ce que vous voulez : « Kore, onegai shimasu » (ceci, s’il vous plaît). Et pour dire « oui » à une proposition.' },
  { id: 'pb_daijobu', kana: 'だいじょうぶです', romaji: 'Daijōbu desu', fr: 'Ça va / non merci', when: 'Le « non merci » poli : pas de sac, pas de reçu, pas besoin d’aide.' },
  { id: 'pb_moichido', kana: 'もう いちど おねがいします', romaji: 'Mō ichido onegai shimasu', fr: 'Encore une fois, s’il vous plaît', when: 'Vous n’avez pas compris ? On vous répétera avec plaisir.' },
  { id: 'pb_yukkuri', kana: 'ゆっくり おねがいします', romaji: 'Yukkuri onegai shimasu', fr: 'Plus lentement, s’il vous plaît', when: 'À combiner avec la phrase précédente.' },
  { id: 'pb_wakarimasen', kana: 'わかりません', romaji: 'Wakarimasen', fr: 'Je ne comprends pas', when: 'Avec un sourire. On vous montrera souvent un écran ou une feuille.' },
  { id: 'pb_eigo', kana: 'えいごで いいですか？', romaji: 'Eigo de ii desu ka?', fr: 'Je peux parler anglais ?', when: 'Plan B : beaucoup de vendeurs ont aussi une tablette de traduction.' },
  { id: 'pb_kore', kana: 'これ ください', romaji: 'Kore kudasai', fr: 'Ceci, s’il vous plaît', when: 'En montrant du doigt. Marche partout : menu, vitrine, étagère.' },
  { id: 'pb_arigato', kana: 'ありがとうございます', romaji: 'Arigatō gozaimasu', fr: 'Merci (poli)', when: 'À la fin de chaque échange. Un petit hochement de tête en plus.' },
];

/** à RECONNAÎTRE à l'oreille : ce que les vendeurs disent tout le temps */
export const EAR_WORDS: PhraseCard[] = [
  { id: 'pb_irasshaimase', kana: 'いらっしゃいませ', romaji: 'Irasshaimase', fr: 'Bienvenue !', when: 'Crié à votre entrée. Pas besoin de répondre : un sourire ou un signe de tête suffit.' },
  { id: 'pb_kashikomari', kana: 'かしこまりました', romaji: 'Kashikomarimashita', fr: 'Bien compris / entendu', when: 'Le vendeur a pris votre demande. Attendez la suite.' },
  { id: 'pb_shosho', kana: 'しょうしょう おまちください', romaji: 'Shōshō omachi kudasai', fr: 'Un instant, s’il vous plaît', when: 'On vous demande de patienter. Repérez « machi » (attendre).' },
  { id: 'pb_yoroshii', kana: 'よろしいですか？', romaji: 'Yoroshii desu ka?', fr: 'Cela vous convient ?', when: 'Une question oui / non : répondez « Hai » (oui) ou « Daijōbu desu ».' },
  { id: 'pb_desuka', kana: '〜ですか？ / 〜ますか？', romaji: '… desu ka? / … masu ka?', fr: '(fin de question)', when: 'Le « ka » final = c’est une question. Concentrez-vous sur le mot juste avant.' },
  { id: 'pb_omochi', kana: 'おもちですか？', romaji: 'O-mochi desu ka?', fr: 'Avez-vous… ?', when: 'Carte de fidélité, passeport, sac… Réponse : « Hai » ou « Motte imasen » (je n’en ai pas).' },
  { id: 'pb_en', kana: '〜えんです', romaji: '… en desu', fr: 'C’est … yens', when: 'Le prix. Les nombres arrivent juste avant « en ». Regardez aussi l’écran de la caisse !' },
  { id: 'pb_kudasai', kana: '〜て ください', romaji: '… te kudasai', fr: 'Veuillez…', when: 'Une consigne : « tatchi shite kudasai » (posez votre carte), « kochira e dōzo » (par ici).' },
];

/** pour scripts/generate-voices.ts (phrases complètes uniquement, pas les modèles « 〜 ») */
export function getPhrasebookVoiceLines(): VoiceLine[] {
  const line = (p: PhraseCard, speaker: 'npc' | 'player'): VoiceLine => ({
    id: p.id,
    scenarioId: 'phrasebook',
    speaker,
    kana: p.kana,
    romaji: p.romaji,
    fr: p.fr,
    text: p.kana.replace(/\s+/g, ''),
  });
  return [...MAGIC_PHRASES.map((p) => line(p, 'player')), ...EAR_WORDS.filter((p) => !p.kana.includes('〜')).map((p) => line(p, 'npc'))];
}

/** une carte a-t-elle un audio lisible ? (les modèles « 〜 » n'en ont pas) */
export const hasAudio = (p: PhraseCard) => !p.kana.includes('〜');
