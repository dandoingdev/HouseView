const widgets = new Map();
const strings = {en: {'state.unavailable': 'Unavailable', 'state.offline': 'Offline'}};
export function registerWidget(def, s) {
  if (widgets.has(def.type)) throw new Error(`duplicate ${def.type}`);
  widgets.set(def.type, def);
  for (const [lang, table] of Object.entries(s || {})) Object.assign((strings[lang] ||= {}), table);
}
export const widgetList = () => [...widgets.values()].sort((a, b) => a.order - b.order);
export const getWidget = (t) => widgets.get(t) || widgetList().find((d) => d.aliases.includes(t));
export const widgetKinds = () => widgetList().map((d) => d.type);
export const widgetLabels = () => Object.fromEntries(widgetList().map((d) => [d.type, d.label]));
export const getStrings = () => strings;
export const unknownOkDomains = () => widgetList().flatMap((d) => d.unknownOkDomains);
export function resolveAction(name) {
  for (const def of widgetList()) {
    for (const [k, v] of Object.entries({...def.actions, ...(def.extension?.actions || {})})) {
      if (k === name) return {owner: def.type, def: v, param: ''};
      if (k.endsWith('*') && name.startsWith(k.slice(0, -1)))
        return {owner: def.type, def: v, param: name.slice(k.length - 1)};
    }
  }
  if (name === 'info') return {owner: 'core', def: {run: (ctx, id) => ctx.info(id)}, param: ''};
  if (name === 'toggle')
    return {
      owner: 'core',
      def: {run: (ctx, id) => ctx.call('homeassistant', 'toggle', {entity_id: id})},
      param: ''
    };
  return null;
}
