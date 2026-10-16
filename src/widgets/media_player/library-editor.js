import {loadLibrary, mediaKey, selectedMode} from './library-data.js';

export const libraryEditor = {
  toForm: (widget) => ({
    playlist_mode: selectedMode(widget) ? 'selected' : 'all',
    playlists: widget.playlists || []
  }),
  loadOptions: (hass, config, signal) => loadLibrary(hass, config.entity, signal),
  schema(hass, config, schema, result) {
    if (!selectedMode(config)) return schema;
    const choices = (result?.items || []).map((item) => ({
      value: mediaKey(item),
      label: item.title
    }));
    for (const value of config.playlists || []) {
      if (!choices.some((item) => item.value === value))
        choices.push({value, label: 'Unavailable saved item'});
    }
    const position = schema.findIndex((item) => item.name === 'playlist_mode') + 1;
    schema.splice(position, 0, {
      name: 'playlists',
      selector: {select: {multiple: true, reorder: true, options: choices}}
    });
    return schema;
  },
  helper(config, result, item) {
    if (item.name !== 'playlists') return undefined;
    if (result?.loading) return 'Loading favourites from this speaker…';
    if (result?.error)
      return 'Could not load favourites. Reopen the editor to retry. Saved selections are preserved.';
    return 'Choose favourites, then drag their chips to reorder. An empty selection shows none. Save playlists in Sonos Favourites first.';
  }
};
