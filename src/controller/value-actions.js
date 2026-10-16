/** Native ranges share the guarded dispatcher. Coalesce writes and drop values whose target context changed (e.g. a new track). */
export function bindValueActions(card, root) {
  const queues = new Map();
  root.addEventListener('change', (event) => {
    const input = event.target.closest?.('input[type="range"][data-value-action]');
    if (!input || input.disabled) return;
    const id = input.dataset.entity;
    const action = `${input.dataset.valueAction}${input.value}`;
    const value = {action, input, context: input.dataset.valueContext};
    const existing = queues.get(id);
    if (existing) {
      existing.next = value;
      return;
    }
    const queue = {next: value};
    queues.set(id, queue);
    void (async () => {
      try {
        while (queue.next) {
          const next = queue.next;
          queue.next = null;
          if (
            next.input.isConnected &&
            !next.input.disabled &&
            next.context === next.input.dataset.valueContext
          )
            await card._act(next.action, id);
        }
      } finally {
        queues.delete(id);
      }
    })();
  });
}
