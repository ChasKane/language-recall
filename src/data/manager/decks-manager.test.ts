import { expect, vi, it, describe, beforeEach } from 'vitest';
import { DecksManager } from './decks-manager';
import {
  CardState,
  CardType,
  SpacedRepetitionAlgorithm,
  SpacedRepetitionItem,
} from 'src/spaced-repetition';
import { Deck } from '../deck';
import BetterRecallPlugin from 'src/main';
import { DEFAULT_SETTINGS } from 'src/settings/data';

function createMockPlugin() {
  const adapter = {
    exists: vi.fn(async () => true),
    mkdir: vi.fn(async () => undefined),
    list: vi.fn(async () => ({ files: [], folders: [] })),
    read: vi.fn(async () => ''),
    write: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    rmdir: vi.fn(async () => undefined),
  };

  return {
    app: {
      vault: {
        adapter,
      },
    },
    getSettings: vi.fn(() => ({ ...DEFAULT_SETTINGS })),
  };
}

describe('DecksManager', () => {
  let decksManager: DecksManager;
  let plugin: ReturnType<typeof createMockPlugin>;
  let adapter: ReturnType<typeof createMockPlugin>['app']['vault']['adapter'];

  beforeEach(() => {
    vi.clearAllMocks();
    const mockAlgorithm = {} as SpacedRepetitionAlgorithm<unknown>;
    plugin = createMockPlugin();
    adapter = plugin.app.vault.adapter;
    decksManager = new DecksManager(
      plugin as unknown as BetterRecallPlugin,
      mockAlgorithm,
    );
  });

  describe('load', () => {
    it('should load existing decks', async () => {
      adapter.list.mockResolvedValue({
        files: ['Language Recall/abcd-Deck 1.md'],
        folders: [],
      });
      adapter.read.mockResolvedValue(`---
id: deck1
name: Deck 1
description: Test deck
createdAt: 2024-01-01
updatedAt: 2024-01-01
---
`);
      await decksManager.load();
      expect(decksManager.getDecks()).toHaveProperty('deck1');
    });
  });

  describe('create', () => {
    it('should create a new deck', async () => {
      const deck = await decksManager.create('New Deck', 'New Description');
      expect(deck).toBeInstanceOf(Deck);
      expect(adapter.write).toHaveBeenCalled();
    });

    it('should throw an error for invalid deck name', async () => {
      await expect(decksManager.create('Invalid/Name', 'Test')).rejects.toThrow(
        'Invalid deck name',
      );
    });

    it('should throw an error for existing deck name', async () => {
      await decksManager.create('Existing Deck', 'Test');
      await expect(
        decksManager.create('Existing Deck', 'Test'),
      ).rejects.toThrow('Deck name already exists');
    });
  });

  describe('updateInformation', () => {
    it('should update deck information', async () => {
      const deck = await decksManager.create('Test Deck', 'Test Description');
      const updatedDeck = await decksManager.updateInformation(
        deck.id,
        'Updated Deck',
        'Updated Description',
      );
      expect(updatedDeck.getName()).toBe('Updated Deck');
      expect(updatedDeck.getDescription()).toBe('Updated Description');
    });

    it('should throw an error for non-existent deck', async () => {
      await expect(
        decksManager.updateInformation(
          'nonexistent',
          'New Name',
          'New Description',
        ),
      ).rejects.toThrow('Deck with id does not exist');
    });
  });

  describe('addCard', () => {
    it('should add a card to a deck', async () => {
      const deck = await decksManager.create('Test Deck', 'Test Description');
      const card = {
        id: 'card1',
        type: CardType.BASIC,
        content: { front: 'Hello', back: 'World' },
        state: CardState.NEW,
        easeFactor: 2.5,
        interval: 0,
        iteration: 0,
        stepIndex: 0,
      } as SpacedRepetitionItem;
      await decksManager.addCard(deck.id, card);
      expect(deck.cards).toHaveProperty('card1');
    });

    it('should throw an error for non-existent deck', async () => {
      const card = {
        id: 'card1',
        type: CardType.BASIC,
        content: { front: 'Hello', back: 'World' },
        state: CardState.NEW,
        easeFactor: 2.5,
        interval: 0,
        iteration: 0,
        stepIndex: 0,
      } as SpacedRepetitionItem;
      await expect(decksManager.addCard('nonexistent', card)).rejects.toThrow(
        'No deck with id found: nonexistent',
      );
    });
  });

  describe('updateCardContent', () => {
    it('should update card content', async () => {
      const deck = await decksManager.create('Test Deck', 'Test Description');
      const card = {
        id: 'card1',
        type: CardType.BASIC,
        content: { front: 'Hello', back: 'World' },
        state: CardState.NEW,
        easeFactor: 2.5,
        interval: 0,
        iteration: 0,
        stepIndex: 0,
      } as SpacedRepetitionItem;
      await decksManager.addCard(deck.id, card);
      const updatedCard = {
        id: 'card1',
        type: CardType.BASIC,
        content: { front: 'foo', back: 'foo' },
        state: CardState.NEW,
        easeFactor: 2.5,
        interval: 0,
        iteration: 0,
        stepIndex: 0,
      } as SpacedRepetitionItem;
      await decksManager.updateCardContent(deck.id, updatedCard);
      expect(deck.cards['card1'].content.front).toBe('foo');
      expect(deck.cards['card1'].content.back).toBe('foo');
    });

    it('should throw an error for non-existent card', async () => {
      const deck = await decksManager.create('Test Deck', 'Test Description');
      const updatedCard = {
        id: 'card1',
        content: { front: 'foo', back: 'foo' },
      } as SpacedRepetitionItem;
      await expect(
        decksManager.updateCardContent(deck.id, updatedCard),
      ).rejects.toThrow(
        `No card in deck with card id found: ${updatedCard.id}`,
      );
    });
  });

  describe('removeCard', () => {
    it('should remove a card from a deck', async () => {
      const deck = await decksManager.create('Test deck', 'Test Description');
      const card = {
        id: 'card1',
        type: CardType.BASIC,
        content: { front: 'Hello', back: 'World' },
        state: CardState.NEW,
        easeFactor: 2.5,
        interval: 0,
        iteration: 0,
        stepIndex: 0,
      } as SpacedRepetitionItem;
      await decksManager.addCard(deck.id, card);
      await decksManager.removeCard(deck.id, 'card1');
      expect(deck.cards).not.toHaveProperty('card1');
    });

    it('should throw an error for non-existent card', async () => {
      const deck = await decksManager.create('Test Deck', 'Test Description');
      await expect(
        decksManager.removeCard(deck.id, 'nonexistent'),
      ).rejects.toThrow('No card in deck with card id found: nonexistent');
    });
  });

  describe('delete', () => {
    it('should delete a deck', async () => {
      const deck = await decksManager.create('Test Deck', 'Test Description');
      await decksManager.delete(deck.id);
      expect(decksManager.getDecks()).not.toHaveProperty(deck.id);
    });

    it('should throw an error for non-existent deck', async () => {
      await expect(decksManager.delete('nonexistent')).rejects.toThrow(
        'Deck name does not exist',
      );
    });
  });
});
