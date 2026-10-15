// Test stand-in for the registry half of src/core/overview-registry.js.
const overviews = new Map();
export const registerOverview = (overview) => overviews.set(overview.type, overview);
export const getOverview = (type) => overviews.get(type);
export const overviewList = () => [...overviews.values()].sort((a, b) => a.order - b.order);
