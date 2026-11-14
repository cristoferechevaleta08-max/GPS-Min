import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { StatusBar } from 'expo-status-bar';
import {
  fetchRoutes,
  formatDistance,
  formatDuration,
  nearestInstructionIndex,
} from './src/routing';
import { searchPlaces } from './src/geocoding';

const INITIAL_REGION = {
  latitude: 19.4326,
  longitude: -99.1332,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

export default function App() {
  const mapRef = useRef(null);
  const locationWatchRef = useRef(null);

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
      const baseSteps = result.steps;
      setSteps(baseSteps);

      subscription = Pedometer.watchStepCount((data) => {
        setSteps(baseSteps + data.steps);
      });
    })();

    return () => {
      active = false;
      if (subscription) subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (location && !destination && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500
      );
    }
  }, [location === null]);

  const currentRoute = routes.length > 0 ? routes[selectedRoute] : null;

  const currentInstruction = useMemo(() => {
    if (!currentRoute || !location) return null;
    const index = nearestInstructionIndex(currentRoute, location);
    if (index === null) return null;
    return { ...currentRoute.steps[index], index };
  }, [currentRoute, location]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (trimmed.length < 3) return;
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
  };

  const handleSelectPlace = (place) => {
    setResults([]);
    setQuery(place.name);
    if (!location) {
      Alert.alert('Espera', 'Aún no tenemos tu ubicación. Activa el GPS e inténtalo de nuevo.');
      return;
    }
    setDestination({ latitude: place.latitude, longitude: place.longitude });
    loadRoutes(location, { latitude: place.latitude, longitude: place.longitude });
  };

  const handleLongPress = (event) => {
    const coords = event.nativeEvent.coordinate;
    if (!location) {
      Alert.alert('Espera', 'Aún no tenemos tu ubicación. Activa el GPS e inténtalo de nuevo.');
      return;
    }
    setDestination(coords);
    loadRoutes(location, coords);
  };

  const loadRoutes = async (origin, dest) => {
    setLoadingRoute(true);
    setRoutes([]);
    setSelectedRoute(0);
    setShowStepsList(false);
    try {
      const found = await fetchRoutes(origin, dest);
      setRoutes(found);
      if (mapRef.current) {
        mapRef.current.fitToCoordinates(found[0].coords, {
          edgePadding: { top: 160, right: 60, bottom: 260, left: 60 },
          animated: true,
        });
      }
    } catch (error) {
      setDestination(null);
      Alert.alert('Error de ruta', error.message);
    } finally {
      setLoadingRoute(false);
    }
  };

  const selectRoute = (index) => {
    setSelectedRoute(index);
    setShowStepsList(false);
    if (mapRef.current && routes[index]) {
      mapRef.current.fitToCoordinates(routes[index].coords, {
        edgePadding: { top: 160, right: 60, bottom: 260, left: 60 },
        animated: true,
      });
    }
  };

  const clearRoute = () => {
    setDestination(null);
    setRoutes([]);
    setSelectedRoute(0);
    setShowStepsList(false);
    setQuery('');
    setResults([]);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        showsUserLocation
        followsUserLocation={false}
        onLongPress={handleLongPress}
      >
        {routes.map((route, index) => (
          <Polyline
            key={`route-${index}`}
            coordinates={route.coords}
            strokeWidth={index === selectedRoute ? 6 : 3}
            strokeColor={index === selectedRoute ? '#2980b9' : '#b0bec5'}
            tappable
            onPress={() => selectRoute(index)}
          />
        ))}
        {destination && (
          <Marker coordinate={destination} title="Destino" pinColor="#e74c3c" />
        )}
      </MapView>

      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar dirección de destino…"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searching && <ActivityIndicator size="small" color="#2980b9" />}
      </View>

      {results.length > 0 && (
        <View style={styles.resultsBox}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {results.map((place) => (
              <TouchableOpacity
                key={place.id}
                style={styles.resultRow}
                onPress={() => handleSelectPlace(place)}
              >
                <Text style={styles.resultName} numberOfLines={1}>
                  {place.name}
                </Text>
                <Text style={styles.resultAddress} numberOfLines={1}>
                  {place.address}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.panel}>
        {locationError ? (
          <Text style={styles.errorText}>{locationError}</Text>
        ) : (
          <View style={styles.row}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{steps.toLocaleString('es-MX')}</Text>
              <Text style={styles.statLabel}>
                pasos hoy {stepsAvailable ? '' : '(sensor no disponible)'}
              </Text>
            </View>
            {currentRoute && (
              <View style={styles.stat}>
                <Text style={styles.statValue}>
                  {formatDistance(currentRoute.distance)}
                </Text>
                <Text style={styles.statLabel}>
                  ruta {selectedRoute + 1} · {formatDuration(currentRoute.duration)}
                </Text>
              </View>
            )}
          </View>
        )}

        {loadingRoute && <ActivityIndicator size="small" color="#2980b9" />}

        {routes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.routeOptions}>
            {routes.map((route, index) => (
              <TouchableOpacity
                key={`option-${index}`}
                style={[
                  styles.routeOption,
                  index === selectedRoute && styles.routeOptionActive,
                ]}
                onPress={() => selectRoute(index)}
              >
                <Text
                  style={[
                    styles.routeOptionText,
                    index === selectedRoute && styles.routeOptionTextActive,
                  ]}
                >
                  Ruta {index + 1} · {formatDistance(route.distance)} ·{' '}
                  {formatDuration(route.duration)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {currentInstruction && !showStepsList && (
          <View style={styles.instructionBanner}>
            <Text style={styles.instructionText}>
              {currentInstruction.text}
            </Text>
            <Text style={styles.instructionDistance}>
              en {formatDistance(currentInstruction.distance)}
            </Text>
          </View>
        )}

        {currentRoute && currentRoute.steps.length > 0 && (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => setShowStepsList((value) => !value)}
          >
            <Text style={styles.linkButtonText}>
              {showStepsList ? 'Ocultar pasos' : 'Ver todos los pasos'}
            </Text>
          </TouchableOpacity>
        )}

        {showStepsList && currentRoute && (
          <ScrollView style={styles.stepsList}>
            {currentRoute.steps.map((step, index) => (
              <View
                key={`step-${index}`}
                style={[
                  styles.stepRow,
                  currentInstruction &&
                    index === currentInstruction.index &&
                    styles.stepRowActive,
                ]}
              >
                <Text style={styles.stepText}>
                  {index + 1}. {step.text}
                </Text>
                <Text style={styles.stepDistance}>
                  {formatDistance(step.distance)}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {routes.length === 0 && !loadingRoute && !locationError && (
          <Text style={styles.hint}>
            Busca una dirección o mantén presionado el mapa para trazar la ruta.
          </Text>
        )}

        {routes.length > 0 && (
          <TouchableOpacity style={styles.button} onPress={clearRoute}>
            <Text style={styles.buttonText}>Limpiar ruta</Text>
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
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: '#2c3e50',
  },
  resultsBox: {
    position: 'absolute',
    top: 68,
    left: 16,
    right: 16,
    maxHeight: 200,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  resultRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ecf0f1',
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
  routeOptions: {
    marginBottom: 8,
  },
  routeOption: {
    borderColor: '#b0bec5',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
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
    backgroundColor: '#eaf4fb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
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
    alignItems: 'center',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ecf0f1',
  },
  stepRowActive: {
    backgroundColor: '#eaf4fb',
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
  errorText: {
    fontSize: 13,
    color: '#c0392b',
    marginBottom: 8,
  },
  button: {
    marginTop: 10,
    backgroundColor: '#2980b9',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
