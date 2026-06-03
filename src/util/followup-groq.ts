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

export interface GroqFollowupOptions extends FollowupRequestOptions {
  apiKey: string;
  model?: string;
}

interface GroqChatCompletionResponse {
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

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

function parseGroqError(data: unknown, status: number | undefined): string {
  if (!data || typeof data !== 'object') {
    return `Groq request failed with status ${status ?? 'unknown'}`;
  }

  const message = (data as GroqChatCompletionResponse).error?.message?.trim();
  if (message) {
    return message;
  }

  return `Groq request failed with status ${status ?? 'unknown'}`;
}

export async function sendGroqFollowup(
  options: GroqFollowupOptions,
): Promise<FollowupResult> {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    cardFront,
    cardBack,
    messages,
    userMessage,
    mode = 'review',
    signal,
  } = options;

  throwIfAborted(signal);

  if (!apiKey.trim()) {
    throw new Error('Groq API key is not configured');
  }

  const trimmedMessage = userMessage.trim();
  if (!trimmedMessage) {
    throw new Error('Message cannot be empty');
  }

  const systemInstruction = buildFollowupSystemInstruction(
    cardFront,
    cardBack,
    mode,
  );

  const response = await requestUrl({
    url: 'https://api.groq.com/openai/v1/chat/completions',
    method: 'POST',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
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

  const data = response.json as GroqChatCompletionResponse;
  if (!response.status || response.status >= 400) {
    throw new Error(parseGroqError(data, response.status));
  }

  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error('Groq returned an empty response');
  }

  const result = parseOpenAiToolFollowupResponse(message);
  if (!result.displayText && !result.cardEdit && !result.saveCard) {
    throw new Error('Groq returned an empty response');
  }

  return result;
}
