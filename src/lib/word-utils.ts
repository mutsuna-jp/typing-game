// Shared Kana engine and CSV parsing utilities for server and client
export type KanaTable = Record<string, string[]>;
export type Word = { disp: string; kana: string };

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
