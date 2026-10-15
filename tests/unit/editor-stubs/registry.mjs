// Test stand-in for src/core/registry.js, used only when the real file does not exist yet (see ../editor-env.mjs).
const widgets = new Map();
export const registerWidget = (def) => {
  if (widgets.has(def.type)) throw new Error(`Duplicate widget: ${def.type}`);
  widgets.set(def.type, def);
};
export const getWidget = (type) =>
  widgets.get(type) || [...widgets.values()].find((d) => d.aliases?.includes(type));
export const widgetList = () => [...widgets.values()].sort((a, b) => a.order - b.order);
