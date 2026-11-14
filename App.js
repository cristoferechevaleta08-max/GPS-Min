import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { StatusBar } from 'expo-status-bar';

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
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
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
    if (location && mapRef.current) {
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

  const handleLongPress = (event) => {
    const coords = event.nativeEvent.coordinate;
    if (!location) {
      Alert.alert('Espera', 'Aún no tenemos tu ubicación. Activa el GPS e inténtalo de nuevo.');
      return;
    }
    setDestination(coords);
    fetchRoute(location, coords);
  };

  const fetchRoute = async (origin, dest) => {
    setLoadingRoute(true);
    setRouteCoords([]);
    setRouteInfo(null);
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${origin.longitude},${origin.latitude};${dest.longitude},${dest.latitude}` +
        `?overview=full&geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('No se encontró una ruta hacia ese destino.');
      }
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map(([lon, lat]) => ({
        latitude: lat,
        longitude: lon,
      }));
      setRouteCoords(coords);
      setRouteInfo({ distance: route.distance, duration: route.duration });
      if (mapRef.current) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 60, bottom: 220, left: 60 },
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

  const clearRoute = () => {
    setDestination(null);
    setRouteCoords([]);
    setRouteInfo(null);
  };

  const formatDistance = (meters) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatDuration = (seconds) => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h ${minutes % 60} min`;
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
        {destination && (
          <Marker coordinate={destination} title="Destino" pinColor="#e74c3c" />
        )}
        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeWidth={5} strokeColor="#2980b9" />
        )}
      </MapView>

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
            {routeInfo && (
              <View style={styles.stat}>
                <Text style={styles.statValue}>{formatDistance(routeInfo.distance)}</Text>
                <Text style={styles.statLabel}>
                  ruta · {formatDuration(routeInfo.duration)}
                </Text>
              </View>
            )}
          </View>
        )}

        {loadingRoute && <ActivityIndicator size="small" color="#2980b9" />}

        <Text style={styles.hint}>
          Mantén presionado el mapa para marcar tu destino y ver la ruta más corta.
        </Text>

        {routeInfo && (
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
  panel: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
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
