export const SUPPORTED_LANGUAGES = {
  ht: 'Haitian Creole',
  fr: 'French',
  en: 'English'
};

const patterns = {
  ht: [
    /\b(mwen|ou|li|nou|yo|pa|ap|gen|vle|bezwen|tanpri|kijan|ki jan|poukisa|paske|travay|jodi a|demen|mesi|bonjou|bonswa|ann|lakay|ayiti|kreyol|kreye|edem|ede m)\b/i,
    /\b(sa k ap|sak ap|nap|map|m ap|n ap|w ap|l ap)\b/i
  ],
  fr: [
    /\b(je|tu|vous|nous|ils|elles|est|suis|êtes|avec|pour|dans|sur|bonjour|bonsoir|merci|comment|pourquoi|besoin|travail|aujourd'hui|demain|aide|pouvez)\b/i,
    /[àâçéèêëîïôùûüÿœ]/i
  ],
  en: [
    /\b(i|you|he|she|we|they|is|are|am|with|for|in|on|hello|hi|thanks|thank you|how|why|need|work|today|tomorrow|help|please|can|could|would)\b/i
  ]
};

export function detectLanguage(text = '') {
  const cleanText = String(text).toLowerCase();
  const scores = { ht: 0, fr: 0, en: 0 };

  for (const [language, languagePatterns] of Object.entries(patterns)) {
    for (const pattern of languagePatterns) {
      if (pattern.test(cleanText)) {
        scores[language] += 1;
      }
    }
  }

  if (scores.ht >= scores.fr && scores.ht >= scores.en && scores.ht > 0) {
    return 'ht';
  }

  if (scores.fr > scores.en && scores.fr > 0) {
    return 'fr';
  }

  if (scores.en > 0) {
    return 'en';
  }

  return 'ht';
}

export function languageInstruction(languageCode) {
  const language = SUPPORTED_LANGUAGES[languageCode] ?? SUPPORTED_LANGUAGES.ht;
  return `Detected language: ${language}. Reply mainly in ${language}. If the user's message mixes languages, use the dominant language. If unsure, use Haitian Creole.`;
}
