// Hand-written stand-in for the generated tests/widgets/manifest.js, for harness self-tests only.
export default [
  {type: 'light', load: () => import('./src/widgets/light/test.js')},
  {type: 'cover', load: () => import('./src/widgets/cover/test.js')}
];
