// Plant data shared by the Plants widget (compact tile) and the Plants overview (full-screen view).
// Pure: state in, view model out. No DOM, no clock, no strings (the callers translate `status`).

export const MAX_PLANTS = 12;

/** Defaults for the care range of a plant; every plant and the widget may override them. */
export const PLANT_DEFAULTS = Object.freeze({
  humidity_low: 30,
  humidity_high: 70,
  temperature_low: 15,
  temperature_high: 28
});

/** Bounds of the temperature bar of the full-screen view, in °C. */
export const TEMPERATURE_SCALE = Object.freeze({min: 5, max: 35});

const SENSOR_ID = /^sensor\.[a-z0-9_]+$/;
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Check the `plants` list of a widget config. Throws the exact message the config error shows.
 * @param {any} list
 */
export function validatePlants(list) {
  if (!Array.isArray(list) || !list.length) {
    throw new Error('Plants widget needs a plants list with at least one plant.');
  }
  if (list.length > MAX_PLANTS)
    throw new Error(`Plants widget shows at most ${MAX_PLANTS} plants.`);
  for (const plant of list) {
    if (!isObject(plant))
      throw new Error('Each plant must be an object with a name and a humidity sensor.');
    if (typeof plant.name !== 'string' || !plant.name.trim()) {
      throw new Error('Each plant needs a name.');
    }
    if (!SENSOR_ID.test(plant.humidity ?? '')) {
      throw new Error('Each plant needs a humidity sensor (sensor.id).');
    }
    for (const key of ['temperature', 'battery']) {
      if (plant[key] !== undefined && !SENSOR_ID.test(plant[key])) {
        throw new Error(`Plant ${key} must be a sensor entity id.`);
      }
    }
    for (const key of Object.keys(PLANT_DEFAULTS)) {
      if (plant[key] !== undefined && !isNumber(plant[key])) {
        throw new Error(`Plant ${key} must be a number.`);
      }
    }
  }
}

/** Every entity a plants list reads, for the change watcher. */
export function plantEntities(list) {
  const ids = [];
  for (const plant of Array.isArray(list) ? list : []) {
    for (const key of ['humidity', 'temperature', 'battery']) {
      if (typeof plant?.[key] === 'string') ids.push(plant[key]);
    }
  }
  return ids;
}

/** The numeric value of a sensor state, or null while it is missing, unavailable, unknown or not a number. */
export function readNumber(stateObj) {
  if (!stateObj || stateObj.state === 'unavailable' || stateObj.state === 'unknown') return null;
  const value = Number.parseFloat(stateObj.state);
  return Number.isFinite(value) ? value : null;
}

const toCelsius = (value, unit) => (unit === '°F' ? ((value - 32) * 5) / 9 : value);

/**
 * One plant as the views need it.
 * @param {Object} plant      an entry of the `plants` list
 * @param {Object} range      widget-level care range (humidity_low, ...); a plant's own keys win
 * @param {(id: string) => Object|undefined} stateOf
 * @returns {{
 *   humidity: number|null, temperature: number|null, battery: number|null, unit: string,
 *   status: 'ok'|'dry'|'wet'|'cold'|'hot'|'offline', humidityStatus: string, temperatureStatus: string,
 *   range: {humidity_low: number, humidity_high: number, temperature_low: number, temperature_high: number},
 *   updated: string|undefined
 * }}
 */
export function readPlant(plant, range, stateOf) {
  const care = {};
  for (const key of Object.keys(PLANT_DEFAULTS)) {
    care[key] = [plant[key], range?.[key], PLANT_DEFAULTS[key]].find(isNumber);
  }
  const humidityState = stateOf(plant.humidity);
  const temperatureState = plant.temperature ? stateOf(plant.temperature) : undefined;
  const batteryState = plant.battery ? stateOf(plant.battery) : undefined;
  const humidity = readNumber(humidityState);
  const temperature = readNumber(temperatureState);
  const battery = readNumber(batteryState);
  const unit = temperatureState?.attributes?.unit_of_measurement || '°C';

  const humidityStatus =
    humidity === null
      ? 'offline'
      : humidity < care.humidity_low
        ? 'dry'
        : humidity > care.humidity_high
          ? 'wet'
          : 'ok';
  let temperatureStatus = 'ok';
  if (temperature !== null) {
    const celsius = toCelsius(temperature, unit);
    if (celsius < care.temperature_low) temperatureStatus = 'cold';
    else if (celsius > care.temperature_high) temperatureStatus = 'hot';
  }
  // Water comes first: a thirsty plant matters more than a cool room.
  const status =
    humidityStatus === 'offline' && temperature === null
      ? 'offline'
      : humidityStatus !== 'ok' && humidityStatus !== 'offline'
        ? humidityStatus
        : temperatureStatus;
  return {
    humidity,
    temperature,
    battery,
    unit,
    status,
    humidityStatus,
    temperatureStatus,
    range: care,
    updated: humidityState?.last_updated
  };
}

/** Plants whose status is not `ok` or `offline`: the ones that need a visit. */
export const needsCare = (status) => status !== 'ok' && status !== 'offline';

/** Percent position (0-100) of `value` between `min` and `max`, clamped. */
export const percentOf = (value, min, max) =>
  Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
