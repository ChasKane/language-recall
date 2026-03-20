import { requestUrl } from 'obsidian';

export interface TranslationOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
}

function applySingleWordCaseHint(
  sourceText: string,
  translatedText: string,
): string {
  if (sourceText.split(/\s+/).length !== 1) {
    return translatedText;
  }
  if (sourceText === sourceText.toLowerCase()) {
    return translatedText.toLowerCase();
  }
  if (
    sourceText ===
    sourceText.charAt(0).toUpperCase() + sourceText.slice(1).toLowerCase()
  ) {
    return (
      translatedText.charAt(0).toUpperCase() +
      translatedText.slice(1).toLowerCase()
    );
  }
  return translatedText;
}

async function tryTranslateWithVariations(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string | null> {
  const variations = [
    text,
    text.toLowerCase(),
    text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
    text.toUpperCase(),
  ];

  for (const variation of variations) {
    try {
      const response = await requestUrl({
        url: `https://api.mymemory.translated.net/get?q=${encodeURIComponent(variation)}&langpair=${sourceLanguage}|${targetLanguage}`,
      });

      const data = response.json;

      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        const translated = data.responseData.translatedText;

        if (translated.toLowerCase() !== variation.toLowerCase()) {
          if (variation !== text) {
            return applySingleWordCaseHint(text, translated);
          }
          return translated;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseGoogleTranslatedText(payload: unknown): string | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return null;
  }
  const chunks = payload[0] as unknown[];
  const translated = chunks
    .map((chunk) =>
      Array.isArray(chunk) && typeof chunk[0] === 'string' ? chunk[0] : '',
    )
    .join('')
    .trim();
  return translated.length > 0 ? translated : null;
}

async function tryTranslateWithGoogle(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string | null> {
  const variations = [
    text,
    text.toLowerCase(),
    text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
  ];

  for (const variation of variations) {
    try {
      const response = await requestUrl({
        url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLanguage)}&tl=${encodeURIComponent(targetLanguage)}&dt=t&q=${encodeURIComponent(variation)}`,
      });
      const translated = parseGoogleTranslatedText(response.json);
      if (!translated) {
        continue;
      }
      if (translated.toLowerCase() !== variation.toLowerCase()) {
        if (variation !== text) {
          return applySingleWordCaseHint(text, translated);
        }
        return translated;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function translateText(
  text: string,
  options: TranslationOptions = {},
): Promise<string> {
  const { sourceLanguage = 'en', targetLanguage = 'es' } = options;

  if (!text || text.trim().length === 0) {
    throw new Error('Text to translate cannot be empty');
  }

  const myMemoryResult = await tryTranslateWithVariations(
    text,
    sourceLanguage,
    targetLanguage,
  );
  if (myMemoryResult) {
    return myMemoryResult;
  }

  const libreTranslateVariations = [
    text,
    text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
  ];

  for (const variation of libreTranslateVariations) {
    try {
      const formData = new URLSearchParams();
      formData.append('q', variation);
      formData.append('source', sourceLanguage);
      formData.append('target', targetLanguage);
      formData.append('format', 'text');

      const response = await requestUrl({
        url: 'https://libretranslate.com/translate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = response.json;

      if (data.error) {
        continue;
      }

      if (
        data.translatedText &&
        data.translatedText.toLowerCase() !== variation.toLowerCase()
      ) {
        return data.translatedText;
      }
    } catch {
      continue;
    }
  }

  const googleResult = await tryTranslateWithGoogle(
    text,
    sourceLanguage,
    targetLanguage,
  );
  if (googleResult) {
    return googleResult;
  }

  throw new Error(
    'Translation failed: all translation providers were unable to translate this text.',
  );
}
