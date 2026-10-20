/**
 * Word filter for abuse in English and Hindi/Hinglish (Latin and Devanagari). It sees through
 * leetspeak, stretched letters, masking and spacing: "f.u.c.k", "fuuuck", "f*ck", "sh1t".
 * Lists stay short and unambiguous so normal class talk (Moby Dick, E = mc², "mujhe chot lagi") never trips it.
 * No server-only import, so scripts can test it directly.
 */

// Whole words (after normalising).
const WORDS = [
  // English
  "fuck", "fucker", "fucking", "fucked", "fck", "fuk", "fuq", "fking", "fkn", "wtf", "stfu", "gtfo",
  "shit", "shitty", "bullshit", "bitch", "bitches", "bastard", "asshole", "ass", "arse", "arsehole",
  "dickhead", "pussy", "cunt", "twat", "wanker", "whore", "slut", "porn", "porno",
  "boobs", "tits", "dildo", "jizz", "horny", "nudes", "sexy", "retard", "retarded",
  "faggot", "fag", "nigger", "nigga", "kys", "douche", "douchebag", "motherfucker", "milf",
  // Hindi / Hinglish (Latin)
  "chutiya", "chutiye", "chutia", "chutiyapa", "chut", "madarchod", "maderchod", "bhenchod",
  "behenchod", "bhanchod", "benchod", "bsdk", "bhosdi", "bhosdike", "bhosadi", "bhosdiwala", "gandu",
  "gaand", "gand", "lund", "lauda", "lavda", "loda", "laude", "randi", "randwa", "harami", "haramkhor",
  "kamina", "kamine", "kutiya", "jhaant", "jhatu", "hijda", "hijde", "bkl", "mkc", "tmkc",
  // Devanagari
  "चूतिया", "चुतिया", "चूत", "मादरचोद", "भेनचोद", "बहनचोद", "भोसड़ी", "भोसडी", "भोसड़ीके", "गांडू", "गांड",
  "लौड़ा", "लोडा", "लंड", "रंडी", "हरामी", "हरामखोर", "कमीना", "कमीने", "कुतिया", "झाटू",
].map((w) => w.normalize("NFKC"));

// Stems that are abusive wherever they appear inside a word ("motherfuckers", "bhenchodd").
const STEMS = ["fuck", "fuk", "motherf", "shit", "bitch", "asshol", "chutiy", "madarch", "bhench", "behench", "bhosd", "nigg", "fagg", "cunt", "whore", "pussy", "dickhead"];
// Innocent words that contain a stem.
const SAFE = new Set(["shiitake", "shitake", "fukushima", "fukuoka", "scunthorpe", "snigger", "sniggering", "niggle", "niggling", "niggles"]);

// Short phrases, matched on the normalised text.
const PHRASES = ["kill yourself", "go die", "son of a bitch", "suck my", "blow job", "send nudes", "teri maa ki", "maa ki aankh", "teri behen ki", "tera baap"];

const LEET: Record<string, string> = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g" };
const MASK = /[*#%]/;
const MASKS = /[*#%]/g;

const squeeze = (w: string) => w.replace(/(.)\1+/gu, "$1");
const WORD_SET = new Set(WORDS);
const SQUEEZED = new Set(WORDS.map(squeeze).filter((w) => w.length >= 4));
const SQUEEZED_STEMS = STEMS.map(squeeze).filter((s) => s.length >= 4);

/** Lowercase tokens with leetspeak undone and "f u c k" / "f.u.c.k" joined back up. */
function tokens(text: string): string[] {
  const raw = text
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => [...t].map((c) => LEET[c] ?? c).join(""))
    .flatMap((t) => (MASK.test(t) ? [t.replace(/[^\p{L}\p{M}*#%]/gu, "")] : t.split(/[^\p{L}\p{M}]+/u)))
    .filter(Boolean);
  // Join runs of single letters: "f u c k" → "fuck".
  const out: string[] = [];
  let run = "";
  for (const t of raw) {
    if ([...t].length === 1) run += t;
    else {
      if (run) out.push(run);
      run = "";
      out.push(t);
    }
  }
  if (run) out.push(run);
  return out;
}

function badToken(t: string): boolean {
  if (SAFE.has(t)) return false;
  const sq = squeeze(t);
  if (WORD_SET.has(t) || SQUEEZED.has(sq)) return true;
  if (STEMS.some((s) => t.includes(s)) || SQUEEZED_STEMS.some((s) => sq.includes(s))) return true;
  // Masked ("f*ck", "sh**"): compare against list words of the same length.
  if (MASK.test(t) && /^\p{L}/u.test(t) && t.replace(MASKS, "").length >= 1 && [...t].length >= 3) {
    const re = new RegExp(`^${t.replace(MASKS, ".")}$`, "u");
    return WORDS.some((w) => re.test(w));
  }
  return false;
}

/** True when the word filter finds abuse in the text. */
export function hasFoulLanguage(text: string): boolean {
  const toks = tokens(text);
  if (toks.some(badToken)) return true;
  const joined = ` ${toks.join(" ")} `;
  return PHRASES.some((p) => joined.includes(` ${p} `));
}
