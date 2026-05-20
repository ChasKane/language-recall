import { requestUrl } from 'obsidian';

export interface TranslationOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Translation cancelled', 'AbortError');
  }
}

interface MyMemoryResponse {
  responseStatus?: number;
  responseData?: {
    translatedText?: string;
  };
}

interface LibreTranslateResponse {
  error?: string;
  translatedText?: string;
}

function parseMyMemoryResponse(payload: unknown): MyMemoryResponse | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  return payload as MyMemoryResponse;
}

function parseLibreTranslateResponse(
  payload: unknown,
): LibreTranslateResponse | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  return payload as LibreTranslateResponse;
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
  signal?: AbortSignal,
): Promise<string | null> {
  const variations = [
    text,
    text.toLowerCase(),
    text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
    text.toUpperCase(),
  ];

  for (const variation of variations) {
    throwIfAborted(signal);
    try {
      const response = await requestUrl({
        url: `https://api.mymemory.translated.net/get?q=${encodeURIComponent(variation)}&langpair=${sourceLanguage}|${targetLanguage}`,
      });

      throwIfAborted(signal);
      const data = parseMyMemoryResponse(response.json);
      if (!data) {
        continue;
      }

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
  signal?: AbortSignal,
): Promise<string | null> {
  const variations = [
    text,
    text.toLowerCase(),
    text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
  ];

  for (const variation of variations) {
    throwIfAborted(signal);
    try {
      const response = await requestUrl({
        url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sourceLanguage)}&tl=${encodeURIComponent(targetLanguage)}&dt=t&q=${encodeURIComponent(variation)}`,
      });
      throwIfAborted(signal);
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
  const { sourceLanguage = 'en', targetLanguage = 'es', signal } = options;

  throwIfAborted(signal);

  if (!text || text.trim().length === 0) {
    throw new Error('Text to translate cannot be empty');
  }

  const myMemoryResult = await tryTranslateWithVariations(
    text,
    sourceLanguage,
    targetLanguage,
    signal,
  );
  throwIfAborted(signal);
  if (myMemoryResult) {
    return myMemoryResult;
  }

  const libreTranslateVariations = [
    text,
    text.charAt(0).toUpperCase() + text.slice(1).toLowerCase(),
  ];

  for (const variation of libreTranslateVariations) {
    throwIfAborted(signal);
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

      throwIfAborted(signal);
      const data = parseLibreTranslateResponse(response.json);
      if (!data) {
        continue;
      }

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

  throwIfAborted(signal);
  const googleResult = await tryTranslateWithGoogle(
    text,
    sourceLanguage,
    targetLanguage,
    signal,
  );
  throwIfAborted(signal);
  if (googleResult) {
    return googleResult;
  }

  throwIfAborted(signal);
  throw new Error(
    'Translation failed: all translation providers were unable to translate this text.',
  );
}
