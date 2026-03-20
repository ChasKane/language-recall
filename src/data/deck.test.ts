import {
  CardState,
  SpacedRepetitionAlgorithm,
  SpacedRepetitionItem,
} from '../spaced-repetition';
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest';
import {
  CardJsonStructure,
  Deck,
  DeckJsonStructure,
  jsonObjectToDeck,
} from './deck';

vi.mock('uuid', async () => {
  const actual = await vi.importActual('uuid');
  return {
    ...actual,
    v4: vi.fn(() => 'mocked-uuid'),
  };
});

describe('Deck', () => {
  let mockAlgorithm: SpacedRepetitionAlgorithm<unknown>;
  const mockNow = new Date(2024, 6, 4, 12, 0, 0); // Local noon to avoid TZ edge cases

  beforeEach(() => {
    mockAlgorithm = {
      isDueToday: vi.fn(),
    } as unknown as SpacedRepetitionAlgorithm<unknown>;
    vi.useFakeTimers().setSystemTime(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('`constructor` should create a deck with default values', () => {
    const deck = new Deck(mockAlgorithm, 'Test Deck', 'Test Description');
    expect(deck.id).toBe('mocked-uuid');
    expect(deck.getName()).toBe('Test Deck');
    expect(deck.getDescription()).toBe('Test Description');
    expect(deck.createdAt).toEqual(mockNow);
    expect(deck.updatedAt).toEqual(mockNow);
    expect(deck.cards).toEqual({});
  });

  it('`toJsonObject` should return correct JSON structure', () => {
    const deck = new Deck(mockAlgorithm, 'Test Deck', 'Test Description');
    const jsonObject = deck.toJsonObject();
    const dateString = mockNow.toDateString();
    expect(jsonObject).toStrictEqual({
      id: 'mocked-uuid',
      name: 'Test Deck',
      description: 'Test Description',
      createdAt: dateString,
      updatedAt: dateString,
      cards: {},
    });
  });

  it('cardsArray should return an array of cards', () => {
    const deck = new Deck(mockAlgorithm, 'Test Deck', 'Test Description');
    const card1 = { id: '1', state: CardState.NEW };
    const card2 = { id: '2', state: CardState.REVIEW };
    deck.cards['1'] = card1 as SpacedRepetitionItem;
    deck.cards['2'] = card2 as SpacedRepetitionItem;
    expect(deck.cardsArray).toEqual([card1, card2]);
  });

  it('scheduledCards should return cards not due today', () => {
    const deck = new Deck(mockAlgorithm, 'Test Deck', 'Test Description');
    const card1 = { id: '1', state: CardState.REVIEW };
    const card2 = { id: '2', state: CardState.NEW };
    const card3 = { id: '3', state: CardState.NEW };
    deck.cards['1'] = card1 as SpacedRepetitionItem;
    deck.cards['2'] = card2 as SpacedRepetitionItem;
    deck.cards['3'] = card3 as SpacedRepetitionItem;
    (mockAlgorithm.isDueToday as Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    expect(deck.scheduledCards).toEqual([card1, card3]);
  });

  it('dueCards should return all cards due today', () => {
    const deck = new Deck(mockAlgorithm, 'Test Deck', 'Test Description');
    const card1 = { id: '1', state: CardState.REVIEW };
    const card2 = { id: '2', state: CardState.NEW };
    deck.cards['1'] = card1 as SpacedRepetitionItem;
    deck.cards['2'] = card2 as SpacedRepetitionItem;
    (mockAlgorithm.isDueToday as Mock)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    expect(deck.dueCards).toEqual([card1]);
  });

  it('dueCards should include all cards due today', () => {
    const deck = new Deck(mockAlgorithm, 'Test Deck', 'Test Description');
    const card1 = { id: '1', state: CardState.NEW };
    const card2 = { id: '2', state: CardState.REVIEW };
    deck.cards['1'] = card1 as SpacedRepetitionItem;
    deck.cards['2'] = card2 as SpacedRepetitionItem;
    (mockAlgorithm.isDueToday as Mock)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    expect(deck.dueCards).toEqual([card1]);
  });
});

describe('jsonObjectToDeck', () => {
  let mockAlgorithm: SpacedRepetitionAlgorithm<unknown>;

  beforeEach(() => {
    mockAlgorithm = {} as SpacedRepetitionAlgorithm<unknown>;
  });

  it('should convert JSON object to Deck', () => {
    const now = new Date();
    const jsonObject: DeckJsonStructure = {
      id: 'test-id',
      name: 'Test Deck',
      description: 'Test Description',
      createdAt: '2024-07-04T00:00:00.000Z',
      updatedAt: '2024-07-04T00:00:00.000Z',
      cards: {
        '1': {
          state: CardState.NEW,
          lastReviewDate: now,
          nextReviewDate: now,
        } as unknown as CardJsonStructure,
      },
    };

    const deck = jsonObjectToDeck(mockAlgorithm, jsonObject);

    expect(deck.id).toBe('test-id');
    expect(deck.getName()).toBe('Test Deck');
    expect(deck.getDescription()).toBe('Test Description');
    expect(deck.createdAt).toEqual(new Date('2024-07-04T00:00:00.000Z'));
    expect(deck.updatedAt).toEqual(new Date('2024-07-04T00:00:00.000Z'));
    expect(deck.cards['1']).toEqual({
      id: '1',
      state: CardState.NEW,
      lastReviewDate: now,
      nextReviewDate: now,
    });
  });
});
