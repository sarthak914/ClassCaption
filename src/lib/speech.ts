/**
 * Collapses stutters and repetitions that speech recognition writes out literally:
 * "the the the cell" → "the cell", "pho- photosynthesis" → "photosynthesis",
 * "what is what is a cell" → "what is a cell". Also cleans Whisper's looping output.
 * Works on any script (word boundaries are whitespace, not \b, so Hindi/Tamil etc. work too).
 * Meaningful doubling ("धीरे धीरे", "very very") is kept: a longer word must repeat 3+ times to count as a stutter.
 */
export function tidySpeech(text: string) {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/(?<=^|\s)(\S{1,6})-\s+(?=\1)/giu, ""); // cut-off word starts: "pho- photosynthesis"
  // Single words: short ones ("the the", "is is") from 2 repeats, longer ones from 3.
  t = t.replace(/(?<=^|\s)(\S{1,3}?)[,.]?(?:\s+\1[,.]?)+(?=\s|$)/giu, "$1");
  t = t.replace(/(?<=^|\s)(\S+?)[,.]?(?:\s+\1[,.]?){2,}(?=\s|$)/giu, "$1");
  for (let n = 2; n <= 6; n++) {
    // n-word phrase said twice or more in a row → once (false starts, looping output)
    const re = new RegExp(`(?<=^|\\s)((?:\\S+\\s+){${n - 1}}\\S+?)[,.]?(?:\\s+\\1[,.]?)+(?=\\s|$)`, "giu");
    t = t.replace(re, "$1");
  }
  return t.replace(/\s+([,.!?।])/g, "$1").trim();
}
