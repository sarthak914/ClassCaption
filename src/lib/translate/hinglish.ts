// Tells pure English from Hinglish (Hindi written in English letters, or mixed with Devanagari),
// so clean English goes to IndicTrans2 and Hinglish goes to an LLM that understands it.

/** Romanised Hindi words that are not also English words (a trailing _ marks one left out on purpose, e.g. "mat", "tab", "agar"). */
const HINDI_WORDS = new Set(
  `hai hain hoga hogi honge hota hoti hote tha thi the_ kya kyu kyun kyon kyunki kaise kaisa kaisi kahan kab kaun kitna kitne kitni
  nahi nahin mat_ matlab toh aur ya_ lekin magar phir fir_ isliye kyonki agar_ jab tab_
  mein mai main_ hum humko hame hamein humne aap aapko apna apne apni tum tumko tumhe tera_ mera mere meri hamara hamare
  yeh ye woh wo voh yahan wahan idhar udhar iska uska iske uske inka unka isko usko inko unko
  karo karna karte karta karti kar_ kiya kiye kiyaa raha rahe rahi rha rhe rhi gaya gaye gayi jao jana jaate jata
  poocho pucho puchiye likho likhiye padho padhiye socho sochiye
  dekho dekhiye dekhte dekha samjho samjhe samjha samajh samjhiye suno suniye bolo bolte bataya batao bataiye chalo chaliye
  accha acha achha theek thik bilkul bahut bohot zyada jyada thoda sab sabhi saare kuch koi ek dono pehle baad abhi sirf
  wala wali wale liye saath bina beech upar neeche andar bahar matlab yaani jaise waise aisa aise waisa
  ka ki ke ko se_ ne bhi hi_ na_`
    .split(/\s+/)
    .filter((w) => !w.endsWith("_")),
);

/** True if the text has Devanagari, or at least one romanised Hindi word. */
export function isHinglish(text: string): boolean {
  if (/[ऀ-ॿ]/.test(text)) return true;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.some((w) => HINDI_WORDS.has(w));
}

/** True only when every text is plain English. */
export const allPureEnglish = (texts: string[]) => texts.every((t) => !isHinglish(t));
