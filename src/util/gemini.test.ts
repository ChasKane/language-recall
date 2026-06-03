import { describe, expect, it } from 'vitest';
import {
  buildCardUpdatedContextMessage,
  buildGeminiContents,
  buildGeminiSystemInstruction,
  parseCardEditProposal,
  parseGeminiFollowupResponse,
} from './gemini';

describe('gemini followup helpers', () => {
  it('builds system instruction with card context and edit guidance', () => {
    const instruction = buildGeminiSystemInstruction('hola', 'hello');
    expect(instruction).toContain('Flashcard front:');
    expect(instruction).toContain('hola');
    expect(instruction).toContain('Flashcard back:');
    expect(instruction).toContain('hello');
    expect(instruction).toContain('propose_card_edit');
  });

  it('builds contents from history and current user message', () => {
    const contents = buildGeminiContents(
      [
        { role: 'user', content: 'What tense is this?' },
        { role: 'assistant', content: 'Present tense.' },
      ],
      'Give an example.',
    );

    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'What tense is this?' }] },
      { role: 'model', parts: [{ text: 'Present tense.' }] },
      { role: 'user', parts: [{ text: 'Give an example.' }] },
    ]);
  });

  it('parses card edit proposals from function call args', () => {
    expect(
      parseCardEditProposal({ front: 'hola', back: 'hello' }),
    ).toEqual({ front: 'hola', back: 'hello' });
    expect(parseCardEditProposal({ front: ' ', back: 'hello' })).toBeUndefined();
  });

  it('parses followup responses with text and card edits', () => {
    const result = parseGeminiFollowupResponse({
      candidates: [
        {
          content: {
            parts: [
              { text: 'Here is a clearer version.' },
              {
                functionCall: {
                  name: 'propose_card_edit',
                  args: {
                    front: 'hola',
                    back: 'hello (informal greeting)',
                  },
                },
              },
            ],
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

  it('builds card updated context for follow-up requests', () => {
    const message = buildCardUpdatedContextMessage('bonjour', 'hello');
    expect(message).toContain('confirmed a card edit');
    expect(message).toContain('bonjour');
    expect(message).toContain('hello');
  });
});
