# GPS Min

App móvil (React Native + Expo) que muestra tu ubicación en el mapa, calcula la **ruta más corta** hacia un destino y cuenta tus **pasos** del día.

## Funciones

- 📍 Muestra tu ubicación actual en tiempo real (GPS).
- 🗺️ Mantén presionado el mapa para marcar un destino y ver la ruta más corta (servicio abierto OSRM).
- 🚶 Contador de pasos del día usando el sensor de movimiento del teléfono.
- ℹ️ Distancia y tiempo estimado de la ruta.

## Cómo probarla en tu teléfono

1. Instala **Expo Go** desde la App Store (iOS) o Google Play (Android).
2. En tu computadora:
   ```bash
   npm install
   npx expo start
   ```
3. Escanea el código QR que aparece en la terminal con la app Expo Go.
   - En iOS: con la cámara del teléfono.
   - En Android: con el botón "Scan QR Code" dentro de Expo Go.
4. Acepta los permisos de ubicación y actividad física cuando la app los pida.

> Nota: el teléfono y la computadora deben estar en la misma red Wi-Fi.

## Cómo funciona la ruta

- Se envían tu ubicación y el destino al servidor público de [OSRM](https://project-osrm.org/), que devuelve la ruta en auto más corta.
- La ruta se dibuja en el mapa y se ajusta la vista para mostrarla completa.

## Sobre la "ruta más segura"

Por ahora la app calcula la ruta **más corta**. Una ruta realmente "más segura" (iluminación, criminalidad, tráfico peatonal) requiere fuentes de datos adicionales; es una mejora planeada para una siguiente versión.

## Estructura

```
App.js        Pantalla principal (mapa, ruta y contador de pasos)
app.json      Configuración de Expo y permisos
package.json  Dependencias
```
