import { requestUrl } from 'obsidian';
import {
  FollowupRequestOptions,
  FollowupResult,
  buildFollowupSystemInstruction,
  buildOpenAiChatMessages,
  getFollowupOpenAiTools,
  parseOpenAiToolFollowupResponse,
  throwIfAborted,
} from './followup';

export interface OpenRouterFollowupOptions extends FollowupRequestOptions {
  apiKey: string;
  model?: string;
}

interface OpenRouterChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

const DEFAULT_MODEL = 'openrouter/free';

function parseOpenRouterError(
  data: unknown,
  status: number | undefined,
): string {
  if (!data || typeof data !== 'object') {
    return `OpenRouter request failed with status ${status ?? 'unknown'}`;
  }

  const message = (
    data as OpenRouterChatCompletionResponse
  ).error?.message?.trim();
  if (message) {
    return message;
  }

  return `OpenRouter request failed with status ${status ?? 'unknown'}`;
}

export async function sendOpenRouterFollowup(
  options: OpenRouterFollowupOptions,
): Promise<FollowupResult> {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    cardFront,
    cardBack,
    messages,
    userMessage,
    mode = 'review',
    systemPrompt,
    signal,
  } = options;

  throwIfAborted(signal);

  if (!apiKey.trim()) {
    throw new Error('OpenRouter API key is not configured');
  }

  const trimmedMessage = userMessage.trim();
  if (!trimmedMessage) {
    throw new Error('Message cannot be empty');
  }

  const systemInstruction = buildFollowupSystemInstruction(
    cardFront,
    cardBack,
    mode,
    systemPrompt,
  );

  const response = await requestUrl({
    url: 'https://openrouter.ai/api/v1/chat/completions',
    method: 'POST',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'HTTP-Referer': 'https://github.com/ChasKane/language-recall',
      'X-Title': 'Language Recall',
    },
    body: JSON.stringify({
      model,
      messages: buildOpenAiChatMessages(
        systemInstruction,
        messages,
        trimmedMessage,
      ),
      tools: getFollowupOpenAiTools(mode),
      tool_choice: 'auto',
    }),
    throw: false,
  });

  throwIfAborted(signal);

  const data = response.json as OpenRouterChatCompletionResponse;
  if (!response.status || response.status >= 400) {
    throw new Error(parseOpenRouterError(data, response.status));
  }

  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error('OpenRouter returned an empty response');
  }

  const result = parseOpenAiToolFollowupResponse(message);
  if (!result.displayText && !result.cardEdit && !result.saveCard) {
    throw new Error('OpenRouter returned an empty response');
  }

  return result;
}
