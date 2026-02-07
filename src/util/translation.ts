import { requestUrl } from 'obsidian';

export interface TranslationOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
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
          if (text.split(/\s+/).length === 1 && variation !== text) {
            if (
              text === text.toLowerCase() &&
              translated !== translated.toLowerCase()
            ) {
              return translated.toLowerCase();
            }
            if (
              text ===
              text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
            ) {
              return (
                translated.charAt(0).toUpperCase() +
                translated.slice(1).toLowerCase()
              );
            }
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

  throw new Error(
    'Translation failed: Unable to translate text. The free APIs may have limitations with certain words or case variations.',
  );
}
