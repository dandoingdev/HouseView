// Transient editor selection. Never saved in dashboard YAML or applied to a live dashboard.
export const EDITOR_PREVIEW_EVENT = 'houseview-editor-preview';
let selection;

const scopeOf = (host) => {
  for (let node = host; node; node = node.parentElement || node.getRootNode?.()?.host) {
    if (node.localName === 'hui-dialog-edit-card') return node;
  }
  return host.ownerDocument;
};

export function selectEditorPreview(owner, target) {
  selection = {owner, target};
  window.dispatchEvent(new CustomEvent(EDITOR_PREVIEW_EVENT));
}

export function clearEditorPreview(owner) {
  if (selection?.owner !== owner) return;
  selection = undefined;
  window.dispatchEvent(new CustomEvent(EDITOR_PREVIEW_EVENT));
}

export function editorPreviewFor(host) {
  return selection?.owner.isConnected && scopeOf(selection.owner) === scopeOf(host)
    ? selection.target
    : undefined;
}
