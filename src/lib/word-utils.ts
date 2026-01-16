// Shared Kana engine and CSV parsing utilities for server and client
export type KanaTable = Record<string, string[]>;
export type Word = { disp: string; kana: string };

export const GAME_CONFIG = {
  BASE_SCORE_PER_CHAR: 5,
  COMBO_MULTIPLIER: 0.05,
  PERFECT_SCORE_BONUS: 20,
  DEFAULT_TIME: 60,
  MAX_TIME: 90,
};

// 濁音・半濁音から基本文字へのマッピング
export const voicedMap: Record<string, string> = {
  が: "か",
  ぎ: "き",
  ぐ: "く",
  げ: "け",
  ご: "こ",
  ぱ: "は",
  ぴ: "ひ",
  ぷ: "ふ",
  ぺ: "へ",
  ぽ: "ほ",
  ざ: "さ",
  じ: "し",
  ず: "す",
  ぜ: "せ",
  ぞ: "そ",
  だ: "た",
  ぢ: "ち",
  づ: "つ",
  で: "て",
  ど: "と",
  ば: "は",
  び: "ひ",
  ぶ: "ふ",
  べ: "へ",
  ぼ: "ほ",
};

// 半濁音から対応する濁音へのマッピング（フリック変換の中間状態）
export const semiToVoiced: Record<string, string> = {
  ぱ: "ば",
  ぴ: "び",
  ぷ: "ぶ",
  ぺ: "べ",
  ぽ: "ぼ",
};

// ATOKフラワーフリック入力：同行内の中間状態を許容
// 例：目標が「ち」で入力が「た」の場合、フリック行の中間状態として許容する
export const atokFlickRowMap: Record<string, string[]> = {
  // あ行
  あ: ["あ", "い", "う", "え", "お"],
  い: ["あ", "い", "う", "え", "お"],
  う: ["あ", "い", "う", "え", "お"],
  え: ["あ", "い", "う", "え", "お"],
  お: ["あ", "い", "う", "え", "お"],
  // か行
  か: ["か", "き", "く", "け", "こ"],
  き: ["か", "き", "く", "け", "こ"],
  く: ["か", "き", "く", "け", "こ"],
  け: ["か", "き", "く", "け", "こ"],
  こ: ["か", "き", "く", "け", "こ"],
  // が行
  が: ["が", "ぎ", "ぐ", "げ", "ご"],
  ぎ: ["が", "ぎ", "ぐ", "げ", "ご"],
  ぐ: ["が", "ぎ", "ぐ", "げ", "ご"],
  げ: ["が", "ぎ", "ぐ", "げ", "ご"],
  ご: ["が", "ぎ", "ぐ", "げ", "ご"],
  // さ行
  さ: ["さ", "し", "す", "せ", "そ"],
  し: ["さ", "し", "す", "せ", "そ"],
  す: ["さ", "し", "す", "せ", "そ"],
  せ: ["さ", "し", "す", "せ", "そ"],
  そ: ["さ", "し", "す", "せ", "そ"],
  // ざ行
  ざ: ["ざ", "じ", "ず", "ぜ", "ぞ"],
  じ: ["ざ", "じ", "ず", "ぜ", "ぞ"],
  ず: ["ざ", "じ", "ず", "ぜ", "ぞ"],
  ぜ: ["ざ", "じ", "ず", "ぜ", "ぞ"],
  ぞ: ["ざ", "じ", "ず", "ぜ", "ぞ"],
  // た行
  た: ["た", "ち", "つ", "て", "と"],
  ち: ["た", "ち", "つ", "て", "と"],
  つ: ["た", "ち", "つ", "て", "と"],
  て: ["た", "ち", "つ", "て", "と"],
  と: ["た", "ち", "つ", "て", "と"],
  // だ行
  だ: ["だ", "ぢ", "づ", "で", "ど"],
  ぢ: ["だ", "ぢ", "づ", "で", "ど"],
  づ: ["だ", "ぢ", "づ", "で", "ど"],
  で: ["だ", "ぢ", "づ", "で", "ど"],
  ど: ["だ", "ぢ", "づ", "で", "ど"],
  // な行
  な: ["な", "に", "ぬ", "ね", "の"],
  に: ["な", "に", "ぬ", "ね", "の"],
  ぬ: ["な", "に", "ぬ", "ね", "の"],
  ね: ["な", "に", "ぬ", "ね", "の"],
  の: ["な", "に", "ぬ", "ね", "の"],
  // は行
  は: ["は", "ひ", "ふ", "へ", "ほ"],
  ひ: ["は", "ひ", "ふ", "へ", "ほ"],
  ふ: ["は", "ひ", "ふ", "へ", "ほ"],
  へ: ["は", "ひ", "ふ", "へ", "ほ"],
  ほ: ["は", "ひ", "ふ", "へ", "ほ"],
  // ば行
  ば: ["ば", "び", "ぶ", "べ", "ぼ"],
  び: ["ば", "び", "ぶ", "べ", "ぼ"],
  ぶ: ["ば", "び", "ぶ", "べ", "ぼ"],
  べ: ["ば", "び", "ぶ", "べ", "ぼ"],
  ぼ: ["ば", "び", "ぶ", "べ", "ぼ"],
  // ぱ行
  ぱ: ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
  ぴ: ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
  ぷ: ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
  ぺ: ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
  ぽ: ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
  // ま行
  ま: ["ま", "み", "む", "め", "も"],
  み: ["ま", "み", "む", "め", "も"],
  む: ["ま", "み", "む", "め", "も"],
  め: ["ま", "み", "む", "め", "も"],
  も: ["ま", "み", "む", "め", "も"],
  // や行
  や: ["や", "ゆ", "よ"],
  ゆ: ["や", "ゆ", "よ"],
  よ: ["や", "ゆ", "よ"],
  // ら行
  ら: ["ら", "り", "る", "れ", "ろ"],
  り: ["ら", "り", "る", "れ", "ろ"],
  る: ["ら", "り", "る", "れ", "ろ"],
  れ: ["ら", "り", "る", "れ", "ろ"],
  ろ: ["ら", "り", "る", "れ", "ろ"],
  // わ行
  わ: ["わ", "を", "ん"],
  を: ["わ", "を", "ん"],
  ん: ["わ", "を", "ん"],
};

// 拗音から基本文字へのマッピング（小文字組み合わせをすべて網羅）
export const palatalMap: Record<string, string> = {
  // き系
  きゃ: "き",
  きゅ: "き",
  きょ: "き",
  // し系
  しゃ: "し",
  しゅ: "し",
  しょ: "し",
  しぇ: "し",
  // ち系
  ちゃ: "ち",
  ちゅ: "ち",
  ちょ: "ち",
  ちぇ: "ち",
  // に系
  にゃ: "に",
  にゅ: "に",
  にょ: "に",
  // ひ系
  ひゃ: "ひ",
  ひゅ: "ひ",
  ひょ: "ひ",
  // み系
  みゃ: "み",
  みゅ: "み",
  みょ: "み",
  // り系
  りゃ: "り",
  りゅ: "り",
  りょ: "り",
  // ぎ系
  ぎゃ: "ぎ",
  ぎゅ: "ぎ",
  ぎょ: "ぎ",
  // じ系
  じゃ: "じ",
  じゅ: "じ",
  じょ: "じ",
  じぇ: "じ",
  // び系
  びゃ: "び",
  びゅ: "び",
  びょ: "び",
  // ぴ系
  ぴゃ: "ぴ",
  ぴゅ: "ぴ",
  ぴょ: "ぴ",
  // ぢ系
  ぢゃ: "ぢ",
  ぢゅ: "ぢ",
  ぢょ: "ぢ",
  // て系
  てゃ: "て",
  てゅ: "て",
  てょ: "て",
  てぃ: "て",
  // で系
  でゃ: "で",
  でゅ: "で",
  でょ: "で",
  でぃ: "で",
  // と系
  とぅ: "と",
  // ど系
  どぅ: "ど",
  // つ系
  つぁ: "つ",
  つぃ: "つ",
  つぇ: "つ",
  つぉ: "つ",
  // ふ系
  ふぁ: "ふ",
  ふぃ: "ふ",
  ふぇ: "ふ",
  ふぉ: "ふ",
  ふゅ: "ふ",
  // う系
  うぃ: "う",
  うぇ: "う",
  うぁ: "う",
  うぉ: "う",
  // い系
  いぇ: "い",
  // く系
  くぁ: "く",
  // ぐ系
  ぐぁ: "ぐ",
  // ゔ系
  ゔぁ: "ゔ",
  ゔぃ: "ゔ",
  ゔぇ: "ゔ",
  ゔぉ: "ゔ",
};

/**
 * Simple predictable PRNG (Mulberry32)
 */
export function createPRNG(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Difficulty-based word selection logic (Shared)
 */
export function getNextWordSeeded(
  activeList: Word[],
  elapsedTime: number,
  prng: () => number
) {
  const DIFFICULTY_THRESHOLDS = [20, 40, 60];
  const WORD_LENGTHS = {
    LEVEL1: { min: 1, max: 3 },
    LEVEL2: { min: 3, max: 5 },
    LEVEL3: { min: 4, max: 6 },
    LEVEL4: { min: 5, max: 20 },
  };

  let min: number, max: number;
  if (elapsedTime < DIFFICULTY_THRESHOLDS[0])
    ({ min, max } = WORD_LENGTHS.LEVEL1);
  else if (elapsedTime < DIFFICULTY_THRESHOLDS[1])
    ({ min, max } = WORD_LENGTHS.LEVEL2);
  else if (elapsedTime < DIFFICULTY_THRESHOLDS[2])
    ({ min, max } = WORD_LENGTHS.LEVEL3);
  else ({ min, max } = WORD_LENGTHS.LEVEL4);

  let candidates = activeList.filter(
    (w) => w.kana.length >= min && w.kana.length <= max
  );
  if (candidates.length === 0) candidates = activeList;
  if (candidates.length === 0) return { disp: "NO DATA", kana: "nodata" };

  return candidates[Math.floor(prng() * candidates.length)];
}

export const KanaEngine: {
  table: KanaTable;
  tokenize(kanaWord: string): string[];
  getValidPatterns(token: string, nextToken?: string): string[];
} = {
  table: (function () {
    return {
      あ: ["a"],
      い: ["i", "yi"],
      う: ["u", "wu", "whu"],
      え: ["e"],
      お: ["o"],
      か: ["ka", "ca"],
      き: ["ki"],
      く: ["ku", "cu", "qu"],
      け: ["ke"],
      こ: ["ko", "co"],
      さ: ["sa"],
      し: ["shi", "si", "ci"],
      す: ["su"],
      せ: ["se", "ce"],
      そ: ["so"],
      た: ["ta"],
      ち: ["chi", "ti"],
      つ: ["tsu", "tu"],
      て: ["te"],
      と: ["to"],
      な: ["na"],
      に: ["ni"],
      ぬ: ["nu"],
      ね: ["ne"],
      の: ["no"],
      は: ["ha"],
      ひ: ["hi"],
      ふ: ["fu", "hu"],
      へ: ["he"],
      ほ: ["ho"],
      ま: ["ma"],
      み: ["mi"],
      む: ["mu"],
      め: ["me"],
      も: ["mo"],
      や: ["ya"],
      ゆ: ["yu"],
      よ: ["yo"],
      ら: ["ra"],
      り: ["ri"],
      る: ["ru"],
      れ: ["re"],
      ろ: ["ro"],
      わ: ["wa"],
      を: ["wo"],
      ん: ["nn", "xn", "n"],
      が: ["ga"],
      ぎ: ["gi"],
      ぐ: ["gu"],
      げ: ["ge"],
      ご: ["go"],
      ざ: ["za"],
      じ: ["ji", "zi"],
      ず: ["zu"],
      ぜ: ["ze"],
      ぞ: ["zo"],
      だ: ["da"],
      ぢ: ["ji", "di"],
      づ: ["zu", "du"],
      で: ["de"],
      ど: ["do"],
      ば: ["ba"],
      び: ["bi"],
      ぶ: ["bu"],
      べ: ["be"],
      ぼ: ["bo"],
      ぱ: ["pa"],
      ぴ: ["pi"],
      ぷ: ["pu"],
      ぺ: ["pe"],
      ぽ: ["po"],
      ぁ: ["xa", "la"],
      ぃ: ["xi", "li"],
      ぅ: ["xu", "lu"],
      ぇ: ["xe", "le"],
      ぉ: ["xo", "lo"],
      っ: ["xtu", "ltu", "tsu"],
      ゃ: ["xya", "lya"],
      ゅ: ["xyu", "lyu"],
      ょ: ["xyo", "lyo"],
      ゎ: ["xwa", "lwa"],
      きゃ: ["kya", "kixya"],
      きゅ: ["kyu", "kixyu"],
      きょ: ["kyo", "kixyo"],
      しゃ: ["sha", "sya"],
      しゅ: ["shu", "syu"],
      しょ: ["sho", "syo"],
      ちゃ: ["cha", "tya"],
      ちゅ: ["chu", "tyu"],
      ちょ: ["cho", "tyo"],
      にゃ: ["nya"],
      にゅ: ["nyu"],
      にょ: ["nyo"],
      ひゃ: ["hya"],
      ひゅ: ["hyu"],
      ひょ: ["hyo"],
      みゃ: ["mya"],
      みゅ: ["myu"],
      みょ: ["myo"],
      りゃ: ["rya"],
      りゅ: ["ryu"],
      りょ: ["ryo"],
      ぎゃ: ["gya"],
      ぎゅ: ["gyu"],
      ぎょ: ["gyo"],
      じゃ: ["ja", "jya", "zya"],
      じゅ: ["ju", "jyu", "zyu"],
      じょ: ["jo", "jyo", "zyo"],
      びゃ: ["bya"],
      びゅ: ["byu"],
      びょ: ["byo"],
      ぴゃ: ["pya"],
      ぴゅ: ["pyu"],
      ぴょ: ["pyo"],
      いェ: ["ye"],
      うぁ: ["wha"],
      うぃ: ["wi", "whi"],
      うぇ: ["we", "whe"],
      うぉ: ["who"],
      ヴ: ["vu"],
      ゔ: ["vu"],
      ゔぁ: ["va"],
      ゔぃ: ["vi"],
      ゔぇ: ["ve"],
      ゔぉ: ["vo"],
      くぁ: ["qa", "qwa", "kwa"],
      ぐぁ: ["gwa"],
      しェ: ["she", "sye"],
      じェ: ["je", "jye"],
      ちェ: ["che", "tye"],
      つぁ: ["tsa"],
      つぃ: ["tsi"],
      つぇ: ["tse"],
      つぉ: ["tso"],
      てぃ: ["thi"],
      てゅ: ["thu"],
      でぃ: ["dhi"],
      でゅ: ["dhu"],
      とぅ: ["twu", "toxu"],
      どぅ: ["dwu", "doxu"],
      ふぁ: ["fa"],
      ふぃ: ["fi"],
      ふぇ: ["fe"],
      ふぉ: ["fo"],
      ふゅ: ["fyu"],
    };
  })(),

  tokenize(kanaWord: string) {
    const tokens: string[] = [];
    for (let i = 0; i < kanaWord.length; i++) {
      const char = kanaWord[i];
      const next = kanaWord[i + 1];
      if (
        next &&
        ["ゃ", "ゅ", "ょ", "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ゎ"].includes(next)
      ) {
        tokens.push(char + next);
        i++;
      } else {
        tokens.push(char);
      }
    }
    return tokens;
  },

  getValidPatterns(token: string, nextToken?: string) {
    let patterns: string[] = [...(this.table[token] || [])];

    if (token.length === 2 && token.charAt(0) !== "っ") {
      const char1 = token.charAt(0);
      const char2 = token.charAt(1);
      const p1List = this.table[char1] || [];
      const p2List = this.table[char2] || [];
      for (const p1 of p1List) {
        for (const p2 of p2List) patterns.push(p1 + p2);
      }
    }

    if (token === "っ" && nextToken) {
      const nextBasicPatterns = this.table[nextToken] || [];
      if (nextBasicPatterns.length > 0) {
        const consonants = new Set<string>();
        for (const p of nextBasicPatterns) {
          if (p.length > 0) consonants.add(p[0]);
        }
        patterns = [...consonants, ...patterns];
      }
    }
    return patterns;
  },
};

// Parse CSV text and return words + validation errors (reusable on server and client)
export function parseWords(text: string): { words: Word[]; errors: string[] } {
  const lines = text.split(/\r\n|\n/);
  const words: Word[] = [];
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    if (!raw.trim()) continue;
    const parts = raw.split(",");

    // Allow and skip a header row if it appears to be ASCII labels
    if (
      i === 0 &&
      parts.length >= 2 &&
      /[A-Za-z]/.test(parts[0]) &&
      /[A-Za-z]/.test(parts[1])
    ) {
      continue; // skip header
    }

    if (parts.length < 2) {
      errors.push(`Line ${lineNo}: missing columns`);
      continue;
    }

    const disp = parts[0].trim();
    const kana = parts[1].trim();
    if (!disp || !kana) {
      errors.push(`Line ${lineNo}: empty display or kana`);
      continue;
    }

    const tokens = KanaEngine.tokenize(kana);
    let valid = true;
    for (const t of tokens) {
      if (!KanaEngine.table[t]) {
        valid = false;
        break;
      }
    }
    if (!valid) {
      errors.push(`Line ${lineNo}: invalid kana '${kana}'`);
      continue;
    }

    words.push({ disp, kana });
  }

  return { words, errors };
}
