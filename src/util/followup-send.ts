import { sendGeminiFollowup } from './gemini';
import { sendGroqFollowup } from './followup-groq';
import { sendOpenRouterFollowup } from './followup-openrouter';
import {
  FollowupRequestOptions,
  FollowupResult,
  formatFollowupError,
  selectMessagesForContext,
} from './followup';

export type FallbackProvider = 'groq' | 'openrouter';

export interface FollowupSendOptions extends FollowupRequestOptions {
  geminiApiKey: string;
  geminiModel?: string;
  groqApiKey?: string;
  openRouterApiKey?: string;
  promptFallbackKey?: (
    provider: FallbackProvider,
  ) => Promise<string | null | undefined>;
}

export async function sendFollowupWithFallback(
  options: FollowupSendOptions,
): Promise<FollowupResult> {
  const {
    geminiApiKey,
    geminiModel,
    groqApiKey: initialGroqApiKey = '',
    openRouterApiKey: initialOpenRouterApiKey = '',
    promptFallbackKey,
    signal,
    ...requestOptions
  } = options;

  const errors: string[] = [];
  const contextMessages = selectMessagesForContext(
    requestOptions.messages,
    requestOptions.chatHistoryLimit ?? 2,
  );
  const sendOptions = {
    ...requestOptions,
    messages: contextMessages,
  };

  if (geminiApiKey.trim()) {
    try {
      return await sendGeminiFollowup({
        apiKey: geminiApiKey,
        model: geminiModel,
        signal,
        ...sendOptions,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      errors.push(`Gemini: ${formatFollowupError(error)}`);
    }
  } else {
    errors.push('Gemini: API key is not configured');
  }

  let groqApiKey = initialGroqApiKey.trim();
  if (!groqApiKey && promptFallbackKey) {
    groqApiKey = (await promptFallbackKey('groq'))?.trim() ?? '';
  }

  if (groqApiKey) {
    try {
      return await sendGroqFollowup({
        apiKey: groqApiKey,
        signal,
        ...sendOptions,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      errors.push(`Groq: ${formatFollowupError(error)}`);
    }
  }

  let openRouterApiKey = initialOpenRouterApiKey.trim();
  if (!openRouterApiKey && promptFallbackKey) {
    openRouterApiKey =
      (await promptFallbackKey('openrouter'))?.trim() ?? '';
  }

  if (openRouterApiKey) {
    try {
      return await sendOpenRouterFollowup({
        apiKey: openRouterApiKey,
        signal,
        ...sendOptions,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      errors.push(`OpenRouter: ${formatFollowupError(error)}`);
    }
  }

  if (errors.length === 1) {
    throw new Error(errors[0]);
  }

  throw new Error(errors.join('\n\n'));
}
