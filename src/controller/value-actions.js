/** Native range changes use the ordinary prefix-action dispatcher. Keep the latest value if a write is in flight. */
export function bindValueActions(card, root) {
  const queues = new Map();
  root.addEventListener('change', (event) => {
    const input = event.target.closest?.('input[type="range"][data-value-action]');
    if (!input || input.disabled) return;
    const id = input.dataset.entity;
    const action = `${input.dataset.valueAction}${input.value}`;
    const existing = queues.get(id);
    if (existing) {
      existing.next = {action, input};
      return;
    }
    const queue = {next: {action, input}};
    queues.set(id, queue);
    void (async () => {
      try {
        while (queue.next) {
          const next = queue.next;
          queue.next = null;
          if (next.input.isConnected && !next.input.disabled) await card._act(next.action, id);
        }
      } finally {
        queues.delete(id);
      }
    })();
  });
}
