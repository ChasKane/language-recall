import { DEFAULT_SETTINGS } from '../settings/data';
import { CardState, SpacedRepetitionAlgorithm, SpacedRepetitionItem } from '.';

export enum PerformanceResponse {
  AGAIN,
  HARD,
  GOOD,
  EASY,
}

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Simplified spaced repetition algorithm for language learning.
 * Uses fixed intervals with a customizable multiplier.
 */
export class AnkiAlgorithm extends SpacedRepetitionAlgorithm<number> {
  private baseIntervals = {
    [PerformanceResponse.AGAIN]: 0, // immediate (0 days)
    [PerformanceResponse.HARD]: 1, // 1 day
    [PerformanceResponse.GOOD]: 7, // 7 days
    [PerformanceResponse.EASY]: 21, // 21 days
  };

  public getDefaultValues(): number {
    return DEFAULT_SETTINGS.intervalMultiplier;
  }

  /**
   * Get the multiplier for intervals.
   * The multiplier is set by the user via the slider (0.5 to 2.0).
   */
  private getIntervalMultiplier(): number {
    return this.parameters;
  }

  /**
   * Get the next interval in days based on performance response.
   */
  private getNextIntervalDays(response: PerformanceResponse): number {
    const baseInterval = this.baseIntervals[response];
    const multiplier = this.getIntervalMultiplier();
    return baseInterval * multiplier;
  }

  public calculatePotentialNextReviewDate(
    item: SpacedRepetitionItem,
    performanceResponse: PerformanceResponse,
  ): Date {
    const intervalDays = this.getNextIntervalDays(performanceResponse);
    return this.calculateNextReviewDate(intervalDays);
  }

  public scheduleReview(item: SpacedRepetitionItem): void {
    item.lastReviewDate = new Date();

    // New cards go straight to next review
    if (item.state === CardState.NEW) {
      item.state = CardState.REVIEW;
      // Schedule for AGAIN interval (immediate/0 days)
      const intervalDays = this.getNextIntervalDays(PerformanceResponse.AGAIN);
      item.interval = intervalDays;
      item.nextReviewDate = this.calculateNextReviewDate(intervalDays);
    } else {
      // Existing cards keep their interval
      item.nextReviewDate = this.calculateNextReviewDate(item.interval);
    }

    this.addToQueueIfDueToday(item);
  }

  public getNextReviewItem(): SpacedRepetitionItem | null {
    return this.queuedItems.shift() ?? null;
  }

  public updateItemAfterReview(
    item: SpacedRepetitionItem,
    performanceResponse: PerformanceResponse,
  ): void {
    // Calculate next interval based on response
    const nextIntervalDays = this.getNextIntervalDays(performanceResponse);
    item.interval = nextIntervalDays;
    item.iteration += 1;

    this.scheduleReview(item);
  }

  private calculateNextReviewDate(days: number): Date {
    const now = new Date();
    const milliseconds = days * MILLISECONDS_PER_DAY;
    return new Date(now.getTime() + milliseconds);
  }
}
