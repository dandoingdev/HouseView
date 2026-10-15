// The version comes from package.json: tools/build.mjs injects it as the esbuild define __HV_VERSION__.
// Outside the bundle (Node unit tests, unbundled debugging) the define does not exist.
export const VERSION = typeof __HV_VERSION__ === 'string' ? __HV_VERSION__ : '0.0.0-dev';
