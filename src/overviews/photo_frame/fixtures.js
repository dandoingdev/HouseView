// Variants for tests, previews and screenshots. Data only, imports nothing.
const folder = 'media-source://media_source/local/Photos';
const make = (options = {}) => ({options: {folder, ...options}, states: {}});

export const variants = {
  ok: make(),
  noFolder: make({folder: ''}),
  shortFolder: make({folder: 'Photos'}),
  noTime: make({show_time: false}),
  fast: make({interval: 10, shuffle: false}),
  recursive: make({recursive: true})
};
