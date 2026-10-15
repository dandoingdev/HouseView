// Deliberately failing widget tests, to prove the browser harness reports failures. Used by harness-meta.test.mjs.
export default [
  {
    type: 'light',
    load: async () => ({default: async ({check}) => check('this check fails on purpose', false)})
  },
  {type: 'cover', load: async () => ({default: async () => {}})},
  {
    type: 'switch',
    load: async () => ({
      default: async () => {
        throw new Error('boom');
      }
    })
  }
];
