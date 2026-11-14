const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const REQUEST_TIMEOUT_MS = 15000;

export async function searchPlaces(query) {
  const url =
    `${NOMINATIM_BASE}` +
    `?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=es`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let results;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GPS-Min/1.0 (mobile app)' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error('bad-status');
    }
    results = await response.json();
  } catch (error) {
    if (error && (error.name === 'AbortError' || error.message === 'bad-status')) {
      throw new Error('La búsqueda tardó demasiado o falló. Revisa tu conexión e intenta de nuevo.');
    }
    throw new Error('No se pudo buscar la dirección. Intenta de nuevo.');
  } finally {
    clearTimeout(timer);
  }
  return results.map((item) => ({
    id: item.place_id,
    name: item.name || item.display_name.split(',')[0],
    address: item.display_name,
    latitude: parseFloat(item.lat),
    longitude: parseFloat(item.lon),
  }));
}
