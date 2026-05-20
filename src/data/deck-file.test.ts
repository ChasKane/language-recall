import { describe, expect, it } from 'vitest';
import { CardState, CardType } from 'src/spaced-repetition';
import { parseDeckFile, stringifyDeckFile } from './deck-file';
import type { DeckJsonStructure } from './deck';

describe('deck file card escaping', () => {
  it('round trips new lines, backslashes, and pipes in card text', () => {
    const deck: DeckJsonStructure = {
      id: 'deck-id',
      name: 'Deck',
      description: '',
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
      cards: {
        'card-id': {
          type: CardType.BASIC,
          content: {
            front: 'hola\nmundo | test',
            back: 'path\\to\\word\nanswer',
          },
          state: CardState.NEW,
          easeFactor: 2.5,
          interval: 0,
          iteration: 0,
          stepIndex: 0,
          nextReviewDate: new Date('2026-05-03T12:00:00.000Z'),
        },
      },
    };

    const parsedDeck = parseDeckFile(stringifyDeckFile(deck));

    expect(parsedDeck.cards['card-id'].content).toEqual(
      deck.cards['card-id'].content,
    );
  });
});
