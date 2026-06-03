export interface CardEditProposal {
  front: string;
  back: string;
}

export interface FollowupChatMessage {
  role: 'user' | 'assistant';
  content: string;
  cardEdit?: CardEditProposal;
  cardEditApplied?: boolean;
  saveCard?: boolean;
  saveCardApplied?: boolean;
  kind?: 'card-updated';
}

export interface FollowupResult {
  displayText: string;
  cardEdit?: CardEditProposal;
  saveCard?: boolean;
}

export type FollowupMode = 'review' | 'draft';

export interface FollowupRequestOptions {
  cardFront: string;
  cardBack: string;
  messages: FollowupChatMessage[];
  userMessage: string;
  mode?: FollowupMode;
  signal?: AbortSignal;
}

export const CARD_EDIT_FUNCTION_NAME = 'propose_card_edit';
export const SAVE_CARD_FUNCTION_NAME = 'save_card';

export const CARD_EDIT_OPENAI_TOOL = {
  type: 'function' as const,
  function: {
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
  },
};

export const SAVE_CARD_OPENAI_TOOL = {
  type: 'function' as const,
  function: {
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
  },
};

export function getFollowupOpenAiTools(mode: FollowupMode = 'review') {
  const tools: Array<typeof CARD_EDIT_OPENAI_TOOL | typeof SAVE_CARD_OPENAI_TOOL> =
    [CARD_EDIT_OPENAI_TOOL];
  if (mode === 'draft') {
    tools.push(SAVE_CARD_OPENAI_TOOL);
  }
  return tools;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Follow-up request cancelled', 'AbortError');
  }
}

export function buildFollowupSystemInstruction(
  cardFront: string,
  cardBack: string,
  mode: FollowupMode = 'review',
): string {
  const draftLines =
    mode === 'draft'
      ? [
          'The user is composing a new flashcard in the editor (not yet saved).',
          'You can propose edits to update the front/back fields in the form using propose_card_edit.',
          'When the user asks to save or add the card, call save_card so they can confirm saving.',
          'Apply edits to the form first if the card text still needs changes before saving.',
        ]
      : [];

  return [
    'You are a helpful language-learning assistant.',
    'The user is reviewing a flashcard and may ask follow-up questions about it.',
    ...draftLines,
    'Keep answers concise and focused on helping them learn.',
    '',
    'You can propose edits to the flashcard using the propose_card_edit function when the user asks you to fix, improve, clarify, or update the card.',
    'Always include the complete proposed front and back text. Keep unchanged sides identical to the current card.',
    'The user must confirm before edits are applied. Explain your changes in your reply.',
    'Do not call propose_card_edit unless the user wants the card content changed.',
    mode === 'draft'
      ? 'Call save_card only when the user explicitly wants the card saved or added.'
      : '',
    '',
    'Flashcard front:',
    cardFront,
    '',
    'Flashcard back:',
    cardBack,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildCardUpdatedContextMessage(
  front: string,
  back: string,
): string {
  return [
    'The user confirmed a card edit. Use this as the current flashcard content for all following messages:',
    '',
    'Front:',
    front,
    '',
    'Back:',
    back,
  ].join('\n');
}

export function parseCardEditProposal(
  args: Record<string, unknown> | undefined,
): CardEditProposal | undefined {
  if (!args) {
    return undefined;
  }

  const front = typeof args.front === 'string' ? args.front.trim() : '';
  const back = typeof args.back === 'string' ? args.back.trim() : '';
  if (!front || !back) {
    return undefined;
  }

  return { front, back };
}

export function buildOpenAiChatMessages(
  systemInstruction: string,
  messages: FollowupChatMessage[],
  userMessage: string,
): Array<{ role: string; content: string }> {
  const chatMessages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemInstruction },
  ];

  for (const message of messages) {
    chatMessages.push({
      role: message.role,
      content: message.content,
    });
  }

  chatMessages.push({ role: 'user', content: userMessage });
  return chatMessages;
}

interface OpenAiToolCall {
  function?: {
    name?: string;
    arguments?: string;
  };
}

export function parseOpenAiToolFollowupResponse(message: {
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
}): FollowupResult {
  let displayText = message.content?.trim() ?? '';
  let cardEdit: CardEditProposal | undefined;
  let saveCard = false;

  for (const toolCall of message.tool_calls ?? []) {
    const name = toolCall.function?.name;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(toolCall.function?.arguments ?? '{}') as Record<
        string,
        unknown
      >;
    } catch {
      args = {};
    }

    if (name === SAVE_CARD_FUNCTION_NAME) {
      saveCard = true;
      const summary =
        typeof args.summary === 'string' ? args.summary.trim() : '';
      if (summary && !displayText) {
        displayText = summary;
      }
      continue;
    }

    if (name !== CARD_EDIT_FUNCTION_NAME) {
      continue;
    }

    const proposal = parseCardEditProposal(args);
    if (proposal) {
      cardEdit = proposal;
    }

    const summary =
      typeof args.summary === 'string' ? args.summary.trim() : '';
    if (summary && !displayText) {
      displayText = summary;
    }
  }

  if (!displayText && cardEdit) {
    displayText = 'Suggested card update:';
  }

  if (!displayText && saveCard) {
    displayText = 'Ready to save this card.';
  }

  return {
    displayText: displayText.trim(),
    cardEdit,
    saveCard,
  };
}

export function formatFollowupError(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}
