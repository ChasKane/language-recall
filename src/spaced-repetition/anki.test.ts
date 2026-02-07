import { v4 as uuidv4 } from 'uuid';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CardState, CardType, SpacedRepetitionItem } from '.';
import { AnkiAlgorithm, PerformanceResponse } from './anki';

let ankiAlgo: AnkiAlgorithm;

function createSpacedRepetitionItem(content: string): SpacedRepetitionItem {
  return {
    id: uuidv4(),
    content: { front: content, back: content },
    type: CardType.BASIC,
    easeFactor: 2.5,
    interval: 0,
    iteration: 0,
    state: CardState.NEW,
    stepIndex: 0,
  };
}

beforeEach(() => {
  ankiAlgo = new AnkiAlgorithm();
  vi.useFakeTimers().setSystemTime(new Date(2024, 0, 1, 12, 0, 0));
});

describe('getNextReviewItem', () => {
  it('should return `null` when no items are due', () => {
    ankiAlgo.startNewSession();
    expect(ankiAlgo.getNextReviewItem()).toBeNull();
  });

  it('should return a new item when available', () => {
    const item = createSpacedRepetitionItem('Test item');
    ankiAlgo.addItem(item);
    ankiAlgo.startNewSession();
    expect(ankiAlgo.getNextReviewItem()).toStrictEqual(item);
  });

  it('should return a due item when available', () => {
    const item = createSpacedRepetitionItem('Test item');
    ankiAlgo.addItem(item);
    ankiAlgo.startNewSession();
    ankiAlgo.updateItemAfterReview(item, PerformanceResponse.GOOD);
    vi.advanceTimersByTime(1 * 60 * 1000); // Advance 1 minute
    expect(ankiAlgo.getNextReviewItem()).toStrictEqual(item);
  });
});

describe('updateItemAfterReview', () => {
  it('should update item correctly for AGAIN response', () => {
    const item = createSpacedRepetitionItem('Test item');
    ankiAlgo.addItem(item);
    ankiAlgo.startNewSession();

    const reviewItem = ankiAlgo.getNextReviewItem() as SpacedRepetitionItem;
    ankiAlgo.updateItemAfterReview(reviewItem, PerformanceResponse.AGAIN);

    expect(reviewItem.state).toBe(CardState.REVIEW);
    expect(reviewItem.interval).toBe(0);
    expect(reviewItem.iteration).toBe(1);
    expect(reviewItem.nextReviewDate).toBeInstanceOf(Date);
  });

  it('should update item correctly for GOOD response', () => {
    const item = createSpacedRepetitionItem('Test item');
    ankiAlgo.addItem(item);
    ankiAlgo.startNewSession();

    let reviewItem = ankiAlgo.getNextReviewItem() as SpacedRepetitionItem;
    ankiAlgo.updateItemAfterReview(reviewItem, PerformanceResponse.GOOD);

    expect(reviewItem.state).toBe(CardState.REVIEW);
    expect(reviewItem.interval).toBe(7);
    expect(reviewItem.iteration).toBe(1);
  });

  it('should update item correctly for HARD response', () => {
    const item = createSpacedRepetitionItem('Test item');
    ankiAlgo.addItem(item);
    ankiAlgo.startNewSession();

    const reviewItem = ankiAlgo.getNextReviewItem() as SpacedRepetitionItem;
    ankiAlgo.updateItemAfterReview(reviewItem, PerformanceResponse.HARD);

    expect(reviewItem.state).toBe(CardState.REVIEW);
    expect(reviewItem.interval).toBe(1);
    expect(reviewItem.iteration).toBe(1);
  });

  it('should update item correctly for EASY response', () => {
    const item = createSpacedRepetitionItem('Test item');
    ankiAlgo.addItem(item);
    ankiAlgo.startNewSession();

    const reviewItem = ankiAlgo.getNextReviewItem() as SpacedRepetitionItem;
    ankiAlgo.updateItemAfterReview(reviewItem, PerformanceResponse.EASY);

    expect(reviewItem.state).toBe(CardState.REVIEW);
    expect(reviewItem.interval).toBe(21);
    expect(reviewItem.iteration).toBe(1);
  });
});

describe('startNewSession', () => {
  it('should reset the queue and add all due items', () => {
    const item1 = createSpacedRepetitionItem('Item 1');
    const item2 = createSpacedRepetitionItem('Item 2');
    ankiAlgo.addItem(item1);
    ankiAlgo.addItem(item2);
    ankiAlgo.startNewSession();

    expect(ankiAlgo.getNextReviewItem()).toStrictEqual(item1);
    expect(ankiAlgo.getNextReviewItem()).toStrictEqual(item2);
    expect(ankiAlgo.getNextReviewItem()).toBeNull();
  });
});

describe('queuedItems behavior', () => {
  it('should re-add items to the queue if still due after review', () => {
    const item = createSpacedRepetitionItem('Test item');
    ankiAlgo.addItem(item);
    ankiAlgo.startNewSession();

    const reviewItem = ankiAlgo.getNextReviewItem() as SpacedRepetitionItem;
    ankiAlgo.updateItemAfterReview(reviewItem, PerformanceResponse.AGAIN);

    expect(ankiAlgo.getNextReviewItem()).toStrictEqual(reviewItem);
  });

  it('should not re-add items to the queue if not due after review', () => {
    const item = createSpacedRepetitionItem('Test item');
    ankiAlgo.addItem(item);
    ankiAlgo.startNewSession();

    const reviewItem = ankiAlgo.getNextReviewItem() as SpacedRepetitionItem;
    ankiAlgo.updateItemAfterReview(reviewItem, PerformanceResponse.EASY);

    expect(ankiAlgo.getNextReviewItem()).toBeNull();
  });
});
