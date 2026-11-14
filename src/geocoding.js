export async function searchPlaces(query) {
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=es`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GPS-Min/1.0 (mobile app)' },
  });
  if (!response.ok) {
    throw new Error('No se pudo buscar la dirección. Intenta de nuevo.');
  }
  const results = await response.json();
  return results.map((item) => ({
    id: item.place_id,
    name: item.name || item.display_name.split(',')[0],
    address: item.display_name,
    latitude: parseFloat(item.lat),
    longitude: parseFloat(item.lon),
  }));
}
