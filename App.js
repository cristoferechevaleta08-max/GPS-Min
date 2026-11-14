import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import {
  fetchRoutes,
  formatDistance,
  formatDuration,
  nearestInstructionIndex,
} from './src/routing';
import { searchPlaces } from './src/geocoding';
import { MAP_HTML } from './src/mapHtml';

const STEPS_UPDATE_INTERVAL_MS = 2000;

function ManeuverIcon({ icon, size, color }) {
  return (
    <View style={{ transform: [{ rotate: `${icon.rotate}deg` }] }}>
      <Ionicons name={icon.name} size={size} color={color} />
    </View>
  );
}

export default function App() {
  const webViewRef = useRef(null);
  const locationWatchRef = useRef(null);
  const stepsBaseRef = useRef(0);
  const lastStepsUpdateRef = useRef(0);

  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [destination, setDestination] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(0);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [showStepsList, setShowStepsList] = useState(false);
  const [steps, setSteps] = useState(0);
  const [stepsAvailable, setStepsAvailable] = useState(false);

  const [webReady, setWebReady] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);

  const hasRoute = routes.length > 0;

  const postToMap = useCallback((script) => {
    webViewRef.current?.injectJavaScript(`${script}; true;`);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active) return;
      if (status !== 'granted') {
        setLocationError('Permiso de ubicación denegado. Habilítalo para ver rutas.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (!active) return;
      setLocation(position.coords);

      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (pos) => {
          if (active) setLocation(pos.coords);
        }
      );
      locationWatchRef.current = watch;
    })();

    return () => {
      active = false;
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let subscription;
    let active = true;

    (async () => {
      const available = await Pedometer.isAvailableAsync();
      if (!active) return;
      if (!available) return;

      const { granted } = await Pedometer.requestPermissionsAsync();
      if (!active || !granted) return;

      setStepsAvailable(true);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const result = await Pedometer.getStepCountAsync(startOfDay);
      if (!active) return;
      stepsBaseRef.current = result.steps;
      setSteps(result.steps);

      subscription = Pedometer.watchStepCount((data) => {
        const total = stepsBaseRef.current + data.steps;
        const now = Date.now();
        if (now - lastStepsUpdateRef.current >= STEPS_UPDATE_INTERVAL_MS) {
          lastStepsUpdateRef.current = now;
          setSteps(total);
        }
      });
    })();

    return () => {
      active = false;
      if (subscription) subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!hasRoute) return;
    activateKeepAwakeAsync();
    return () => deactivateKeepAwake();
  }, [hasRoute]);

  useEffect(() => {
    if (webReady && location) {
      postToMap(`window.setUserLocation(${location.latitude}, ${location.longitude})`);
    }
  }, [location, webReady, postToMap]);

  useEffect(() => {
    if (!webReady) return;
    if (routes.length > 0) {
      const data = routes.map((route) => ({
        coords: route.coords.map((c) => [c.latitude, c.longitude]),
      }));
      postToMap(`window.setRoutes(${JSON.stringify(data)}, ${selectedRoute})`);
    } else {
      postToMap('window.clearRoutes()');
    }
  }, [webReady, routes, postToMap]);

  useEffect(() => {
    if (!webReady || routes.length === 0) return;
    postToMap(`window.setSelected(${selectedRoute})`);
  }, [webReady, selectedRoute, routes.length, postToMap]);

  useEffect(() => {
    if (!webReady) return;
    if (destination) {
      postToMap(`window.setDestination(${destination.latitude}, ${destination.longitude})`);
    } else {
      postToMap('window.clearDestination()');
    }
  }, [webReady, destination, postToMap]);

  const currentRoute = hasRoute ? routes[selectedRoute] : null;

  const currentInstruction = useMemo(() => {
    if (!currentRoute || !location) return null;
    const index = nearestInstructionIndex(currentRoute, location);
    if (index === null) return null;
    return { ...currentRoute.steps[index], index };
  }, [currentRoute, location]);

  const handleMapMessage = useCallback(
    (event) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'ready') {
          setWebReady(true);
        } else if (msg.type === 'destination') {
          setDestinationFromCoords({ latitude: msg.lat, longitude: msg.lng });
        } else if (msg.type === 'selectRoute') {
          setSelectedRoute(msg.index);
          setShowStepsList(false);
        }
      } catch (error) {}
    },
    []
  );

  const setDestinationFromCoords = useCallback(
    (coords) => {
      if (!location) {
        Alert.alert('Espera', 'Aún no tenemos tu ubicación. Activa el GPS e inténtalo de nuevo.');
        return;
      }
      setDestination(coords);
      loadRoutes(location, coords);
    },
    [location]
  );

  const loadRoutes = useCallback(async (origin, dest) => {
    setLoadingRoute(true);
    setRoutes([]);
    setSelectedRoute(0);
    setShowStepsList(false);
    try {
      const found = await fetchRoutes(origin, dest);
      setRoutes(found);
    } catch (error) {
      setDestination(null);
      Alert.alert('Error de ruta', error.message);
    } finally {
      setLoadingRoute(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 3 || searching) return;
    setSearching(true);
    setResults([]);
    try {
      const places = await searchPlaces(trimmed);
      if (places.length === 0) {
        Alert.alert('Sin resultados', 'No encontramos esa dirección. Prueba con otra.');
      }
      setResults(places);
    } catch (error) {
      Alert.alert('Error de búsqueda', error.message);
    } finally {
      setSearching(false);
    }
  }, [query, searching]);

  const handleSelectPlace = useCallback(
    (place) => {
      setResults([]);
      setQuery(place.name);
      setDestinationFromCoords({ latitude: place.latitude, longitude: place.longitude });
    },
    [setDestinationFromCoords]
  );

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
  }, []);

  const clearRoute = useCallback(() => {
    setDestination(null);
    setRoutes([]);
    setSelectedRoute(0);
    setShowStepsList(false);
    setQuery('');
    setResults([]);
  }, []);

  const centerOnUser = useCallback(() => {
    postToMap('window.centerOnUser()');
  }, [postToMap]);

  const canSearch = query.trim().length >= 3;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <WebView
        ref={webViewRef}
        source={{ html: MAP_HTML }}
        style={styles.map}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMapMessage}
      />

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#95a5a6" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar dirección de destino…"
          placeholderTextColor="#b0bec5"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="never"
        />
        {query.length > 0 && !searching && (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={clearSearch}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={18} color="#b0bec5" />
          </TouchableOpacity>
        )}
        {searching ? (
          <ActivityIndicator size="small" color="#2980b9" style={styles.iconButton} />
        ) : (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleSearch}
            disabled={!canSearch}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="arrow-forward-circle"
              size={28}
              color={canSearch ? '#2980b9' : '#d5dbdb'}
            />
          </TouchableOpacity>
        )}
      </View>

      {results.length > 0 && (
        <View style={styles.resultsBox}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {results.map((place) => (
              <TouchableOpacity
                key={place.id}
                style={styles.resultRow}
                activeOpacity={0.6}
                onPress={() => handleSelectPlace(place)}
              >
                <View style={styles.resultIcon}>
                  <Ionicons name="location-outline" size={18} color="#2980b9" />
                </View>
                <View style={styles.resultTexts}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {place.name}
                  </Text>
                  <Text style={styles.resultAddress} numberOfLines={2}>
                    {place.address}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#b0bec5" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {location && !locationError && (
        <TouchableOpacity
          style={[styles.fab, { bottom: panelHeight + 40 }]}
          activeOpacity={0.7}
          onPress={centerOnUser}
        >
          <Ionicons name="locate" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      <View style={styles.panel} onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}>
        {locationError ? (
          <View style={styles.errorRow}>
            <Ionicons name="warning-outline" size={18} color="#c0392b" />
            <Text style={styles.errorText}>{locationError}</Text>
          </View>
        ) : (
          <View style={styles.row}>
            <View style={styles.stat}>
              <View style={styles.statHeader}>
                <Ionicons name="footsteps" size={16} color="#2980b9" />
                <Text style={styles.statValue}>{steps.toLocaleString('es-MX')}</Text>
              </View>
              <Text style={styles.statLabel}>
                pasos hoy {stepsAvailable ? '' : '(sensor no disponible)'}
              </Text>
            </View>
            {currentRoute && (
              <View style={[styles.stat, styles.statRight]}>
                <View style={styles.statHeader}>
                  <Ionicons name="map" size={16} color="#27ae60" />
                  <Text style={styles.statValue}>
                    {formatDistance(currentRoute.distance)}
                  </Text>
                </View>
                <Text style={styles.statLabel}>
                  ruta {selectedRoute + 1} · {formatDuration(currentRoute.duration)}
                </Text>
              </View>
            )}
          </View>
        )}

        {loadingRoute && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#2980b9" />
            <Text style={styles.loadingText}>Calculando rutas…</Text>
          </View>
        )}

        {routes.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.routeOptions}
          >
            {routes.map((route, index) => (
              <TouchableOpacity
                key={`option-${index}`}
                style={[
                  styles.routeOption,
                  index === selectedRoute && styles.routeOptionActive,
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedRoute(index);
                  setShowStepsList(false);
                }}
              >
                <Ionicons
                  name={index === selectedRoute ? 'navigate' : 'map-outline'}
                  size={14}
                  color={index === selectedRoute ? '#2980b9' : '#546e7a'}
                />
                <Text
                  style={[
                    styles.routeOptionText,
                    index === selectedRoute && styles.routeOptionTextActive,
                  ]}
                >
                  {formatDistance(route.distance)} · {formatDuration(route.duration)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {currentInstruction && !showStepsList && (
          <View style={styles.instructionBanner}>
            <View style={styles.instructionIcon}>
              <ManeuverIcon icon={currentInstruction.icon} size={20} color="#21618c" />
            </View>
            <View style={styles.instructionTexts}>
              <Text style={styles.instructionText}>{currentInstruction.text}</Text>
              <Text style={styles.instructionDistance}>
                en {formatDistance(currentInstruction.distance)}
              </Text>
            </View>
          </View>
        )}

        {currentRoute && currentRoute.steps.length > 0 && (
          <TouchableOpacity
            style={styles.linkButton}
            activeOpacity={0.6}
            onPress={() => setShowStepsList((value) => !value)}
          >
            <Ionicons name="list" size={15} color="#2980b9" />
            <Text style={styles.linkButtonText}>
              {showStepsList ? 'Ocultar pasos' : 'Ver todos los pasos'}
            </Text>
            <Ionicons
              name={showStepsList ? 'chevron-up' : 'chevron-down'}
              size={14}
              color="#2980b9"
            />
          </TouchableOpacity>
        )}

        {showStepsList && currentRoute && (
          <FlatList
            data={currentRoute.steps}
            keyExtractor={(_, index) => `step-${index}`}
            style={styles.stepsList}
            initialNumToRender={12}
            renderItem={({ item, index }) => (
              <View
                style={[
                  styles.stepRow,
                  currentInstruction &&
                    index === currentInstruction.index &&
                    styles.stepRowActive,
                ]}
              >
                <View style={styles.stepIcon}>
                  <ManeuverIcon icon={item.icon} size={16} color="#2980b9" />
                </View>
                <Text style={styles.stepText}>{item.text}</Text>
                <Text style={styles.stepDistance}>{formatDistance(item.distance)}</Text>
              </View>
            )}
          />
        )}

        {!hasRoute && !loadingRoute && !locationError && (
          <Text style={styles.hint}>
            Busca una dirección o mantén presionado el mapa para trazar la ruta.
          </Text>
        )}

        {hasRoute && (
          <TouchableOpacity
            style={styles.clearButton}
            activeOpacity={0.7}
            onPress={clearRoute}
          >
            <Ionicons name="trash-outline" size={16} color="#c0392b" />
            <Text style={styles.clearButtonText}>Limpiar ruta</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  map: {
    flex: 1,
  },
  searchBox: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2c3e50',
  },
  iconButton: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  resultsBox: {
    position: 'absolute',
    top: 72,
    left: 16,
    right: 16,
    maxHeight: 220,
    backgroundColor: '#fff',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ecf0f1',
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eaf4fb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  resultTexts: {
    flex: 1,
    marginRight: 8,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  resultAddress: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2980b9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  panel: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    maxHeight: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stat: {
    flex: 1,
  },
  statRight: {
    alignItems: 'flex-end',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2c3e50',
  },
  statLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#2980b9',
  },
  routeOptions: {
    marginBottom: 8,
  },
  routeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderColor: '#b0bec5',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  routeOptionActive: {
    borderColor: '#2980b9',
    backgroundColor: '#eaf4fb',
  },
  routeOptionText: {
    fontSize: 12,
    color: '#546e7a',
  },
  routeOptionTextActive: {
    color: '#2980b9',
    fontWeight: '700',
  },
  instructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eaf4fb',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    gap: 10,
  },
  instructionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionTexts: {
    flex: 1,
  },
  instructionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#21618c',
  },
  instructionDistance: {
    fontSize: 12,
    color: '#5499c7',
    marginTop: 2,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  linkButtonText: {
    fontSize: 13,
    color: '#2980b9',
    fontWeight: '600',
  },
  stepsList: {
    maxHeight: 180,
    marginTop: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ecf0f1',
  },
  stepRowActive: {
    backgroundColor: '#eaf4fb',
  },
  stepIcon: {
    width: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  stepText: {
    flex: 1,
    fontSize: 13,
    color: '#2c3e50',
    marginRight: 8,
  },
  stepDistance: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  hint: {
    fontSize: 13,
    color: '#95a5a6',
    textAlign: 'center',
    marginTop: 4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#c0392b',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#fdecea',
    borderRadius: 10,
    paddingVertical: 10,
  },
  clearButtonText: {
    color: '#c0392b',
    fontWeight: '600',
    fontSize: 14,
  },
});
