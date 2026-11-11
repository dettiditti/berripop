/**
 * How Berri writes Hungarian, added to every AI request (lib/server/ai). The
 * model tends to translate English self-help terms word for word and coin
 * stiff compound nouns ("légzésfigyelem"); this asks for natural, everyday
 * Hungarian instead. Harmless when the answer is in English.
 */
export const HUNGARIAN_STYLE =
  "Whenever you write in Hungarian, write the way a native Hungarian speaker would naturally say it to a friend: plain, warm, everyday Hungarian. " +
  "Never translate English phrases or psychology and self-help terms word for word, and do not coin compound nouns or titles from them " +
  "(wrong: \"Légzésfigyelem\", \"Önreflexiós gyakorlat\", \"Hálanapló-írás\", \"Tudatos jelenlét pillanat\", \"Énidő-tervezés\"). " +
  "Prefer verbs and simple phrases (right: \"Figyelj egy percig a légzésedre\", \"Gondold végig\", \"Írj le három dolgot, aminek ma örültél\", \"Szánj magadra tíz percet\"). " +
  "Titles and step names are short, natural Hungarian phrases or sentences. Use correct word order, suffixes and punctuation, „…” quotation marks, and no English words.";
