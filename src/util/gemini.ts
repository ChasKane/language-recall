import { requestUrl } from 'obsidian';
import {
  CARD_EDIT_FUNCTION_NAME,
  CardEditProposal,
  FollowupChatMessage,
  FollowupMode,
  FollowupRequestOptions,
  FollowupResult,
  SAVE_CARD_FUNCTION_NAME,
  buildFollowupSystemInstruction,
  buildCardUpdatedContextMessage,
  parseCardEditProposal,
  throwIfAborted,
} from './followup';

export type {
  CardEditProposal,
  FollowupChatMessage as GeminiChatMessage,
  FollowupMode as GeminiFollowupMode,
  FollowupResult as GeminiFollowupResult,
};

export { buildCardUpdatedContextMessage, parseCardEditProposal };

export interface GeminiFollowupOptions extends FollowupRequestOptions {
  apiKey: string;
  model?: string;
}

interface GeminiResponsePart {
  text?: string;
  functionCall?: {
    name?: string;
    args?: Record<string, unknown>;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiResponsePart[];
    };
  }>;
  error?: {
    message?: string;
    code?: number;
  };
}

const DEFAULT_MODEL = 'gemini-2.5-flash';

const CARD_EDIT_FUNCTION_DECLARATION = {
  name: CARD_EDIT_FUNCTION_NAME,
  description:
    'Propose an edit to the flashcard. The user must confirm before changes are saved.',
  parameters: {
    type: 'object',
    properties: {
      front: {
        type: 'string',
        description: 'The complete proposed front side text.',
      },
      back: {
        type: 'string',
        description: 'The complete proposed back side text.',
      },
      summary: {
        type: 'string',
        description: 'Brief explanation of the proposed changes.',
      },
    },
    required: ['front', 'back'],
  },
};

const SAVE_CARD_FUNCTION_DECLARATION = {
  name: SAVE_CARD_FUNCTION_NAME,
  description:
    'Save the flashcard with the current front and back text when the user asks to save or add the card.',
  parameters: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Brief confirmation of what will be saved.',
      },
    },
  },
};

function parseGeminiError(data: unknown, status: number | undefined): string {
  if (!data || typeof data !== 'object') {
    return `Gemini request failed with status ${status ?? 'unknown'}`;
  }

  const error = (data as GeminiGenerateContentResponse).error;
  const message = error?.message?.trim();
  if (!message) {
    return `Gemini request failed with status ${status ?? 'unknown'}`;
  }

  if (status === 403 || error?.code === 403) {
    return [
      message,
      'Check your API key at aistudio.google.com/apikey:',
      '• Create the key in Google AI Studio (not Cloud Console unless configured)',
      '• Set application restrictions to "None" (Obsidian is a desktop app)',
      '• Restrict the key to "Generative Language API" / Gemini only',
    ].join('\n');
  }

  return message;
}

export function buildGeminiSystemInstruction(
  cardFront: string,
  cardBack: string,
  mode: FollowupMode = 'review',
  systemPrompt?: string,
): string {
  return buildFollowupSystemInstruction(
    cardFront,
    cardBack,
    mode,
    systemPrompt,
  );
}

export function parseGeminiFollowupResponse(
  data: GeminiGenerateContentResponse,
): FollowupResult {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  let displayText = '';
  let cardEdit: CardEditProposal | undefined;
  let saveCard = false;

  for (const part of parts) {
    if (part.text) {
      displayText += part.text;
    }

    if (part.functionCall?.name === SAVE_CARD_FUNCTION_NAME) {
      saveCard = true;
      const summary =
        typeof part.functionCall.args?.summary === 'string'
          ? part.functionCall.args.summary.trim()
          : '';
      if (summary && !displayText.trim()) {
        displayText = summary;
      }
      continue;
    }

    if (part.functionCall?.name !== CARD_EDIT_FUNCTION_NAME) {
      continue;
    }

    const proposal = parseCardEditProposal(part.functionCall.args);
    if (proposal) {
      cardEdit = proposal;
    }

    const summary =
      typeof part.functionCall.args?.summary === 'string'
        ? part.functionCall.args.summary.trim()
        : '';
    if (summary && !displayText.trim()) {
      displayText = summary;
    }
  }

  if (!displayText.trim() && cardEdit) {
    displayText = 'Suggested card update:';
  }

  if (!displayText.trim() && saveCard) {
    displayText = 'Ready to save this card.';
  }

  return {
    displayText: displayText.trim(),
    cardEdit,
    saveCard,
  };
}

export function buildGeminiContents(
  messages: FollowupChatMessage[],
  userMessage: string,
): Array<{ role: string; parts: Array<{ text: string }> }> {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> =
    [];

  for (const message of messages) {
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    });
  }

  contents.push({
    role: 'user',
    parts: [{ text: userMessage }],
  });

  return contents;
}

export async function sendGeminiFollowup(
  options: GeminiFollowupOptions,
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
    throw new Error('Gemini API key is not configured');
  }

  const trimmedMessage = userMessage.trim();
  if (!trimmedMessage) {
    throw new Error('Message cannot be empty');
  }

  const tools =
    mode === 'draft'
      ? [
          {
            functionDeclarations: [
              CARD_EDIT_FUNCTION_DECLARATION,
              SAVE_CARD_FUNCTION_DECLARATION,
            ],
          },
        ]
      : [{ functionDeclarations: [CARD_EDIT_FUNCTION_DECLARATION] }];

  const response = await requestUrl({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    method: 'POST',
    contentType: 'application/json',
    headers: {
      'x-goog-api-key': apiKey.trim(),
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: buildFollowupSystemInstruction(
              cardFront,
              cardBack,
              mode,
              systemPrompt,
            ),
          },
        ],
      },
      contents: buildGeminiContents(messages, trimmedMessage),
      tools,
    }),
    throw: false,
  });

  throwIfAborted(signal);

  const data = response.json as GeminiGenerateContentResponse;
  if (!response.status || response.status >= 400) {
    throw new Error(parseGeminiError(data, response.status));
  }

  const result = parseGeminiFollowupResponse(data);
  if (!result.displayText && !result.cardEdit && !result.saveCard) {
    throw new Error('Gemini returned an empty response');
  }

  return result;
}
