import { describe, expect, it } from 'vitest';
import {
  buildFollowupSystemInstruction,
  buildOpenAiChatMessages,
  parseOpenAiToolFollowupResponse,
} from './followup';

describe('followup shared helpers', () => {
  it('builds system instruction with card context and edit guidance', () => {
    const instruction = buildFollowupSystemInstruction('hola', 'hello');
    expect(instruction).toContain('Flashcard front:');
    expect(instruction).toContain('hola');
    expect(instruction).toContain('propose_card_edit');
  });

  it('builds OpenAI chat messages with system prompt and history', () => {
    const messages = buildOpenAiChatMessages(
      'system prompt',
      [{ role: 'user', content: 'What tense is this?' }],
      'Give an example.',
    );

    expect(messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'What tense is this?' },
      { role: 'user', content: 'Give an example.' },
    ]);
  });

  it('parses card edit and save tool calls from OpenAI-style responses', () => {
    const result = parseOpenAiToolFollowupResponse({
      content: 'Here is a clearer version.',
      tool_calls: [
        {
          function: {
            name: 'propose_card_edit',
            arguments: JSON.stringify({
              front: 'hola',
              back: 'hello (informal greeting)',
            }),
          },
        },
      ],
    });

    expect(result.displayText).toBe('Here is a clearer version.');
    expect(result.cardEdit).toEqual({
      front: 'hola',
      back: 'hello (informal greeting)',
    });
  });
});
