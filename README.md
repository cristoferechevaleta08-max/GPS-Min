# GPS Min

App móvil (React Native + Expo) que muestra tu ubicación en el mapa, calcula **rutas hacia un destino** con indicaciones paso a paso y cuenta tus **pasos** del día.

## Funciones

- 📍 Muestra tu ubicación actual en tiempo real (GPS).
- 🔍 Busca destinos por dirección (geocoding con Nominatim/OpenStreetMap) o mantén presionado el mapa para marcar uno.
- 🗺️ Calcula hasta 3 rutas alternativas (OSRM) y elige la que prefieras tocándola en el mapa o en las tarjetas inferiores.
- 🧭 Modo navegación: indicación actual en pantalla y lista completa de pasos ("gira a la derecha en…", distancias, glorieta, salidas, etc.).
- 🚶 Contador de pasos del día usando el sensor de movimiento del teléfono.
- ℹ️ Distancia y tiempo estimado de cada ruta.

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

## Generar el APK (Android)

Con [EAS Build](https://docs.expo.dev/build/introduction/) puedes empaquetar la app para instalarla sin Expo Go:

```bash
npm install -g eas-cli
eas login          # cuenta de Expo (gratuita)
eas build -p android --profile preview
```

Al terminar, EAS te da un enlace para descargar el `.apk` e instalarlo en cualquier Android. El perfil `production` genera un `.aab` para publicar en Google Play.

## Cómo funcionan las rutas

- Se envían tu ubicación y el destino al servidor público de [OSRM](https://project-osrm.org/) con `alternatives=2` y `steps=true`.
- Cada ruta incluye sus indicaciones de maniobra traducidas a español y se dibuja en el mapa (la seleccionada en azul, las demás en gris).
- La indicación "actual" se estima con el punto de maniobra más cercano a tu posición GPS.

## Sobre la "ruta más segura"

La app muestra **rutas alternativas** para que elijas la que prefieras. Una selección automática de "ruta más segura" (iluminación, criminalidad, tráfico peatonal) requiere fuentes de datos adicionales; es una mejora planeada.

## Estructura

```
App.js           Pantalla principal (mapa, búsqueda, rutas y pasos)
src/routing.js   Cliente OSRM, indicaciones y utilidades de formato
src/geocoding.js Búsqueda de direcciones (Nominatim)
app.json         Configuración de Expo y permisos
eas.json         Perfiles de build (APK preview / AAB producción)
package.json     Dependencias
```
