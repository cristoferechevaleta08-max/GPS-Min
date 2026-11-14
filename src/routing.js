const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = 15000;

const MODIFIER_TEXT = {
  left: 'a la izquierda',
  right: 'a la derecha',
  'sharp left': 'giro cerrado a la izquierda',
  'sharp right': 'giro cerrado a la derecha',
  'slight left': 'ligeramente a la izquierda',
  'slight right': 'ligeramente a la derecha',
  straight: 'recto',
  uturn: 'en U',
};

function maneuverIcon({ type, modifier }) {
  if (type === 'arrive') return { name: 'flag', rotate: 0 };
  if (type === 'depart') return { name: 'navigate', rotate: 0 };
  if (
    type === 'roundabout' ||
    type === 'rotary' ||
    type === 'roundabout turn' ||
    type === 'exit roundabout' ||
    type === 'exit rotary'
  ) {
    return { name: 'sync', rotate: 0 };
  }
  if (type === 'on ramp') return { name: 'log-in-outline', rotate: 0 };
  if (type === 'off ramp') return { name: 'log-out-outline', rotate: 0 };
  if (type === 'merge' || type === 'fork') {
    return { name: 'git-network-outline', rotate: 0 };
  }
  if (type === 'uturn' || modifier === 'uturn') {
    return { name: 'return-up-back', rotate: 0 };
  }
  if (modifier === 'left') return { name: 'arrow-back', rotate: 0 };
  if (modifier === 'right') return { name: 'arrow-forward', rotate: 0 };
  if (modifier === 'slight left') return { name: 'arrow-up', rotate: -45 };
  if (modifier === 'slight right') return { name: 'arrow-up', rotate: 45 };
  if (modifier === 'sharp left') return { name: 'arrow-back', rotate: -45 };
  if (modifier === 'sharp right') return { name: 'arrow-forward', rotate: 45 };
  return { name: 'arrow-up', rotate: 0 };
}

function instructionText(step) {
  const road = step.name ? ` en ${step.name}` : '';
  const { type, modifier } = step.maneuver;
  switch (type) {
    case 'depart':
      return `Comienza por ${step.name || 'la ruta'}`;
    case 'arrive':
      return 'Llegaste a tu destino';
    case 'turn':
    case 'end of road':
      return `Gira ${MODIFIER_TEXT[modifier] || ''}${road}`.trim();
    case 'continue':
      return `Continúa ${MODIFIER_TEXT[modifier] || 'recto'}${road}`.trim();
    case 'new name':
      return `Continúa por ${step.name || 'la misma vía'}`;
    case 'merge':
      return `Incorpórate ${MODIFIER_TEXT[modifier] || ''}${road}`.trim();
    case 'on ramp':
      return `Toma la entrada${road}`;
    case 'off ramp':
      return `Toma la salida ${MODIFIER_TEXT[modifier] || ''}${road}`.trim();
    case 'fork':
      return `Mantente ${MODIFIER_TEXT[modifier] || ''} en la bifurcación`.trim();
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return `Entra a la glorieta y continúa${road}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Sal de la glorieta${road}`;
    default:
      return `Continúa${road}`;
  }
}

function buildSteps(osrmSteps) {
  return (osrmSteps || []).map((step) => ({
    text: instructionText(step),
    distance: step.distance,
    lat: step.maneuver.location[1],
    lon: step.maneuver.location[0],
    icon: maneuverIcon(step.maneuver),
  }));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRoutes(origin, dest) {
  const url =
    `${OSRM_BASE}/` +
    `${origin.longitude},${origin.latitude};${dest.longitude},${dest.latitude}` +
    `?overview=full&geometries=geojson&alternatives=2&steps=true`;
  let data;
  try {
    const response = await fetchWithTimeout(url);
    data = await response.json();
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('El servidor de rutas tardó demasiado. Revisa tu conexión e intenta de nuevo.');
    }
    throw new Error('No se pudo conectar con el servidor de rutas.');
  }
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error('No se encontró una ruta hacia ese destino.');
  }
  return data.routes.map((route) => ({
    coords: route.geometry.coordinates.map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon,
    })),
    distance: route.distance,
    duration: route.duration,
    steps: buildSteps(route.legs && route.legs[0] ? route.legs[0].steps : []),
  }));
}

function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestInstructionIndex(route, coords) {
  if (!route || !route.steps.length) return null;
  let best = 0;
  let bestDist = Infinity;
  route.steps.forEach((step, index) => {
    const d = haversineMeters(coords, { latitude: step.lat, longitude: step.lon });
    if (d < bestDist) {
      bestDist = d;
      best = index;
    }
  });
  return best;
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}
