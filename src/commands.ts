import BetterRecallPlugin from './main';

export function registerCommands(plugin: BetterRecallPlugin): void {
  plugin.addCommand({
    id: 'open-decks',
    name: 'Open decks',
    callback: () => {
      plugin.openRecallView();
    },
  });
  plugin.addCommand({
    id: 'add-card',
    name: 'Add card',
    callback: () => {
      void plugin.openRecallViewAndAddCard();
    },
  });
}
