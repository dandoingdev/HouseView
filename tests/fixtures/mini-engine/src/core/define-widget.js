export function defineWidget(def) {
  const type = def.type;
  const out = {
    entity: 'required',
    domains: def.entity === 'none' ? [] : [type],
    aliases: [],
    defaultSize: 'normal',
    availability: 'entity',
    unknownOkDomains: [],
    layoutRoles: [],
    family: null,
    standalone: true,
    preview: true,
    cardRows: 3,
    standaloneHeight: 240,
    gridOptions: {},
    options: {},
    actions: {},
    editor: {name: true},
    ...def
  };
  return Object.freeze(out);
}
