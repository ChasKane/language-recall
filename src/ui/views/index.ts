import {
  FileView,
  Notice,
  ViewStateResult,
  WorkspaceLeaf,
} from 'obsidian';
import BetterRecallPlugin from '../../main';
import { EmptyView } from './EmptyView';
import { ReviewView } from './ReviewView';
import { DecksView } from './DecksView';
import { CardsView } from './CardsView';
import { FollowupView } from './FollowupView';
import { CardEditorView } from './CardEditorView';
import { CreateDeckView } from './CreateDeckView';
import { EditDeckView } from './EditDeckView';
import { RecallSubView } from './SubView';
import { Deck } from 'src/data/deck';
import type { SpacedRepetitionItem } from 'src/spaced-repetition';
import { FollowupReturnTo, FollowupViewContext } from './FollowupView';
import { CENTERED_VIEW } from '../classes';
import { FILE_VIEW_TYPE } from '../constants';

export { FILE_VIEW_TYPE };

type CapacitorBackListenerHandle = {
  remove?: () => void | Promise<void>;
};

enum ViewMode {
  Empty,
  Decks,
  Review,
  Followup,
  Cards,
  CardEditor,
  CreateDeck,
  EditDeck,
}

type LegacyLeafNavState = {
  screen?: 'card-editor';
  deckId?: string;
  cardId?: string;
  returnTo?: 'decks' | 'review' | 'cards';
};

export class RecallView extends FileView {
  private _rootEl: HTMLElement | null = null;

  /** Root container for subviews; created on first access so DOM is ready. */
  public get rootEl(): HTMLElement {
    if (!this._rootEl) {
      // ItemView provides contentEl; fall back to .view-content or containerEl
      const parent =
        this.contentEl ??
        this.containerEl?.querySelector?.('.view-content') ??
        this.containerEl;
      if (!parent) {
        throw new Error('RecallView: no container available');
      }
      this._rootEl = parent.createDiv(CENTERED_VIEW);
      if (!this._rootEl) {
        throw new Error('RecallView: createDiv failed');
      }
    }
    return this._rootEl;
  }

  private currentView?: RecallSubView;
  private emptyView: EmptyView;
  private reviewView: ReviewView;
  private followupView: FollowupView;
  private decksView: DecksView;
  private cardsView: CardsView;
  private cardEditorView: CardEditorView;
  private createDeckView: CreateDeckView;
  private editDeckView: EditDeckView;

  private viewMode: ViewMode;
  private cardEditorReturnTo: 'decks' | 'review' | { deck: Deck } = 'decks';
  private followupReturnTo: FollowupReturnTo = 'review';
  private capacitorBackListenerHandle: CapacitorBackListenerHandle | null =
    null;
  private legacyRestoreState: LegacyLeafNavState | null = null;
  private reviewSessionGeneration = 0;
  private readonly handleAddDeckHandler = () => {
    this.handleAddDeck();
  };
  private readonly handleDecksLoaded = () => {
    this.syncViewModeAfterDecksLoaded();
  };

  constructor(
    private plugin: BetterRecallPlugin,
    leaf: WorkspaceLeaf,
  ) {
    super(leaf);
    this.allowNoFile = true;
    this.icon = 'blocks';

    this.reviewView = new ReviewView(plugin, this);
    this.followupView = new FollowupView(plugin, this);
    this.emptyView = new EmptyView(plugin, this);
    this.decksView = new DecksView(plugin, this);
    this.cardsView = new CardsView(plugin, this);
    this.cardEditorView = new CardEditorView(plugin, this);
    this.createDeckView = new CreateDeckView(plugin, this);
    this.editDeckView = new EditDeckView(plugin, this);

    this.setViewMode(ViewMode.Decks);
  }

  private syncViewModeAfterDecksLoaded(): void {
    if (!this.plugin.decksManager.isLoaded()) {
      return;
    }

    const hasDecks = this.plugin.decksManager.decksArray.length > 0;

    if (!hasDecks && this.viewMode === ViewMode.Decks) {
      this.setViewMode(ViewMode.Empty);
      this.renderView();
      return;
    }

    if (hasDecks && this.viewMode === ViewMode.Empty) {
      this.setViewMode(ViewMode.Decks);
      this.renderView();
      return;
    }

    if (this.viewMode === ViewMode.Decks) {
      this.renderView();
    }
  }

  /**
   * Handles Escape and Android hardware back (often delivered as Escape in WebView).
   * Only runs when this Recall leaf is active and the current screen can go back.
   */
  private tryHandleBackNavigation(ev?: Event): boolean {
    const isActiveLeaf =
      this.plugin.app.workspace.getActiveViewOfType(RecallView) === this;
    const canGoBack = this.canGoBack();
    const leafIsRecallView = this.leaf.view?.getViewType?.() === FILE_VIEW_TYPE;
    if (!isActiveLeaf) return false;
    if (!leafIsRecallView) return false;
    if (!canGoBack) return false;
    ev?.preventDefault();
    ev?.stopPropagation();
    this.handleBack();
    return true;
  }

  private readonly handleBackKeydown = (ev: KeyboardEvent): void => {
    const key = ev.key;
    const isBackKey = key === 'Escape';
    if (!isBackKey) return;
    this.tryHandleBackNavigation(ev);
  };

  private parseLegacyLeafState(state: unknown): LegacyLeafNavState | null {
    if (
      !state ||
      typeof state !== 'object' ||
      (state as LegacyLeafNavState).screen !== 'card-editor'
    ) {
      return null;
    }
    return state as LegacyLeafNavState;
  }

  private tryApplyLegacyLeafState(): void {
    const state = this.legacyRestoreState;
    if (!state) {
      return;
    }
    this.legacyRestoreState = null;
    if (state.screen !== 'card-editor') {
      return;
    }

    const deck = state.deckId
      ? (this.plugin.decksManager.getDecks()[state.deckId] ?? null)
      : null;
    const card =
      deck && state.cardId
        ? (deck.cardsArray.find((curr) => curr.id === state.cardId) ?? null)
        : null;

    this.cardEditorReturnTo =
      state.returnTo === 'review'
        ? 'review'
        : state.returnTo === 'cards' && deck
          ? { deck }
          : 'decks';
    this.cardEditorView.setContext(deck, card);
    this.setViewMode(ViewMode.CardEditor);
    this.renderView();
  }

  private resolveCardEditorReturnTo(
    deck: Deck | null | undefined,
    card: SpacedRepetitionItem | null | undefined,
    returnTo: 'auto' | 'review' | 'decks' | 'cards',
  ): 'decks' | 'review' | { deck: Deck } {
    if (returnTo === 'review') {
      return 'review';
    }
    if (returnTo === 'decks') {
      return 'decks';
    }
    if (returnTo === 'cards' && deck) {
      return { deck };
    }
    if (deck && card) {
      return { deck };
    }
    return 'decks';
  }

  private setupCapacitorBackListenerForCurrentView(): void {
    const canGoBack = this.canGoBack();
    if (!canGoBack) {
      return;
    }
    const capacitorApp = (
      window as unknown as {
        Capacitor?: {
          Plugins?: {
            App?: {
              addListener: (
                eventName: string,
                cb: () => void,
              ) =>
                | CapacitorBackListenerHandle
                | Promise<CapacitorBackListenerHandle>;
            };
          };
        };
      }
    ).Capacitor?.Plugins?.App;

    if (!capacitorApp) {
      return;
    }

    const maybeHandle = capacitorApp.addListener('backButton', () => {
      this.tryHandleBackNavigation();
    });

    const attachHandle = (handle?: CapacitorBackListenerHandle): void => {
      this.capacitorBackListenerHandle = handle ?? null;
    };

    if (
      maybeHandle &&
      typeof (maybeHandle as Promise<unknown>).then === 'function'
    ) {
      void (maybeHandle as Promise<CapacitorBackListenerHandle>).then(
        attachHandle,
      );
      return;
    }
    attachHandle(maybeHandle as CapacitorBackListenerHandle);
  }

  private teardownCapacitorBackListener(): void {
    const handle = this.capacitorBackListenerHandle;
    this.capacitorBackListenerHandle = null;
    if (!handle?.remove) {
      return;
    }
    void handle.remove();
  }

  private canGoBack(): boolean {
    switch (this.viewMode) {
      case ViewMode.Cards:
      case ViewMode.CardEditor:
      case ViewMode.CreateDeck:
      case ViewMode.EditDeck:
      case ViewMode.Review:
      case ViewMode.Followup:
        return true;
      default:
        return false;
    }
  }

  /** Navigate back from the current screen; no-op on root screens (Decks/Empty). */
  public handleBack(): void {
    switch (this.viewMode) {
      case ViewMode.CardEditor:
        this.goBackFromCardEditor();
        break;
      case ViewMode.CreateDeck:
        this.goBackFromCreateDeck();
        break;
      case ViewMode.EditDeck:
        this.goBackFromEditDeck();
        break;
      case ViewMode.Cards:
        this.openDecksView();
        break;
      case ViewMode.Review:
        this.openDecksView();
        break;
      case ViewMode.Followup:
        this.goBackFromFollowup();
        break;
      default:
        break;
    }
  }

  protected async onOpen(): Promise<void> {
    await super.onOpen();
    this.renderView();

    this.plugin.getEventEmitter().on('addDeck', this.handleAddDeckHandler);
    this.plugin
      .getEventEmitter()
      .on('decksLoaded', this.handleDecksLoaded);
    this.registerDomEvent(window, 'keydown', this.handleBackKeydown, {
      capture: true,
    });
    void this.plugin.decksManager.whenLoaded().then(() => {
      this.tryApplyLegacyLeafState();
      this.syncViewModeAfterDecksLoaded();
    });
  }

  private handleAddDeck(): void {
    if (this.viewMode === ViewMode.Empty) {
      this.setViewMode(ViewMode.Decks);
      this.renderView();
    }
  }

  private setViewMode(viewMode: ViewMode): void {
    this.teardownCapacitorBackListener();
    this.currentView?.onClose();
    this.viewMode = viewMode;
    switch (this.viewMode) {
      case ViewMode.Empty:
        this.currentView = this.emptyView;
        break;
      case ViewMode.Decks:
        this.currentView = this.decksView;
        break;
      case ViewMode.Review:
        this.currentView = this.reviewView;
        break;
      case ViewMode.Followup:
        this.currentView = this.followupView;
        break;
      case ViewMode.Cards:
        this.currentView = this.cardsView;
        break;
      case ViewMode.CardEditor:
        this.currentView = this.cardEditorView;
        break;
      case ViewMode.CreateDeck:
        this.currentView = this.createDeckView;
        break;
      case ViewMode.EditDeck:
        this.currentView = this.editDeckView;
        break;
    }
  }

  public openCardsView(deck: Deck): void {
    this.cardsView.setDeck(deck);
    this.setViewMode(ViewMode.Cards);
    this.renderView();
  }

  public openCardEditorView(
    deck?: Deck | null,
    card?: SpacedRepetitionItem | null,
    returnTo: 'auto' | 'review' | 'decks' | 'cards' = 'auto',
  ): void {
    this.cardEditorReturnTo = this.resolveCardEditorReturnTo(
      deck,
      card,
      returnTo,
    );
    this.cardEditorView.setContext(deck ?? null, card ?? null);
    this.setViewMode(ViewMode.CardEditor);
    this.renderView();
  }

  public goBackFromCardEditor(): void {
    this.cardEditorView.clearSessionState();
    if (this.cardEditorReturnTo === 'decks') {
      this.setViewMode(ViewMode.Decks);
    } else if (this.cardEditorReturnTo === 'review') {
      this.reviewView.prepareResumeFromCardEditor();
      this.setViewMode(ViewMode.Review);
    } else {
      this.cardsView.setDeck(this.cardEditorReturnTo.deck);
      this.setViewMode(ViewMode.Cards);
    }
    this.renderView();
  }

  public openCreateDeckView(): void {
    this.setViewMode(ViewMode.CreateDeck);
    this.renderView();
  }

  public openEditDeckView(deck: Deck): void {
    this.editDeckView.setDeck(deck);
    this.setViewMode(ViewMode.EditDeck);
    this.renderView();
  }

  public goBackFromCreateDeck(): void {
    this.setViewMode(ViewMode.Decks);
    this.renderView();
  }

  public goBackFromEditDeck(): void {
    this.setViewMode(ViewMode.Decks);
    this.renderView();
  }

  /**
   * Starts reviewing a specific deck.
   * Opens review immediately from in-memory data, then reloads from disk.
   * @param deck The deck which will be reviewed.
   */
  public startReviewingDeck(deck: Deck): void {
    const generation = ++this.reviewSessionGeneration;
    try {
      this.reviewView.prepareDeck(deck.id);
    } catch (error) {
      console.error('Failed to start review:', error);
      new Notice('Could not start review. Please try again.');
      return;
    }

    this.setViewMode(ViewMode.Review);
    this.renderView();
    void this.refreshReviewDeck(deck.id, generation);
  }

  private async refreshReviewDeck(
    deckId: string,
    generation: number,
  ): Promise<void> {
    try {
      await this.reviewView.syncDeckFromFile(deckId);
    } catch (error) {
      if (generation !== this.reviewSessionGeneration) {
        return;
      }
      console.error('Failed to reload deck for review:', error);
      new Notice('Could not reload deck for review.');
    }
  }

  public goBackFromFollowup(): void {
    if (this.followupReturnTo === 'review') {
      this.reviewView.prepareResumeFromFollowup();
      this.setViewMode(ViewMode.Review);
    } else {
      this.setViewMode(ViewMode.CardEditor);
    }
    this.renderView();
  }

  public openFollowupView(context: FollowupViewContext): void {
    this.followupReturnTo = context.returnTo;
    if (context.returnTo === 'review') {
      this.reviewView.markForFollowupReturn();
    } else {
      this.cardEditorView.preserveFormStateForFollowup();
    }
    this.followupView.setContext(context);
    this.setViewMode(ViewMode.Followup);
    this.renderView();
  }

  public openDecksView(): void {
    this.setViewMode(ViewMode.Decks);
    this.renderView();
  }

  public openEmptyView(): void {
    this.setViewMode(ViewMode.Empty);
    this.renderView();
  }

  private renderView(): void {
    const el = this.rootEl;
    // Use standard DOM so we don't rely on Obsidian's .empty() patch
    el.replaceChildren();
    this.currentView?.render();
    this.setupCapacitorBackListenerForCurrentView();
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    const legacy = this.parseLegacyLeafState(state);
    if (legacy) {
      this.legacyRestoreState = legacy;
    }
  }

  protected async onClose(): Promise<void> {
    this.teardownCapacitorBackListener();
    this.currentView?.onClose();
    this.plugin.getEventEmitter().off('addDeck', this.handleAddDeckHandler);
    this.plugin
      .getEventEmitter()
      .off('decksLoaded', this.handleDecksLoaded);
    await super.onClose();
  }

  getState(): Record<string, never> {
    return {};
  }

  getDisplayText(): string {
    return 'Recall';
  }

  getViewType(): string {
    return FILE_VIEW_TYPE;
  }
}
