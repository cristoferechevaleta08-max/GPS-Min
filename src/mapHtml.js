export const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; background: #e8eaed; }
  .dest-pin { background: transparent; border: none; }
  .pin {
    width: 22px; height: 22px; background: #e74c3c;
    border: 3px solid #fff; border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false }).setView([19.4326, -99.1332], 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  var userMarker = null;
  var destMarker = null;
  var routeLines = [];
  var hasUser = false;

  function send(obj) {
    window.ReactNativeWebView.postMessage(JSON.stringify(obj));
  }

  map.on('contextmenu', function (e) {
    send({ type: 'destination', lat: e.latlng.lat, lng: e.latlng.lng });
  });
  map.on('dragstart', function () {
    send({ type: 'userDrag' });
  });

  window.setUserLocation = function (lat, lng) {
    if (!userMarker) {
      userMarker = L.circleMarker([lat, lng], {
        radius: 9,
        color: '#ffffff',
        weight: 3,
        fillColor: '#2980b9',
        fillOpacity: 1
      }).addTo(map);
      if (!hasUser) {
        hasUser = true;
        map.setView([lat, lng], 16);
      }
    } else {
      userMarker.setLatLng([lat, lng]);
    }
  };

  window.setRoutes = function (routes, sel) {
    routeLines.forEach(function (line) { map.removeLayer(line); });
    routeLines = routes.map(function (route, i) {
      var line = L.polyline(route.coords, {
        color: i === sel ? '#2980b9' : '#b0bec5',
        weight: i === sel ? 6 : 3,
        opacity: 0.9
      }).addTo(map);
      line.on('click', function () {
        send({ type: 'selectRoute', index: i });
      });
      return line;
    });
    if (routeLines[sel]) {
      map.fitBounds(routeLines[sel].getBounds(), {
        paddingTopLeft: [40, 170],
        paddingBottomRight: [40, 320]
      });
    }
  };

  window.setSelected = function (sel) {
    routeLines.forEach(function (line, i) {
      line.setStyle({
        color: i === sel ? '#2980b9' : '#b0bec5',
        weight: i === sel ? 6 : 3
      });
    });
    if (routeLines[sel]) {
      map.fitBounds(routeLines[sel].getBounds(), {
        paddingTopLeft: [40, 170],
        paddingBottomRight: [40, 320]
      });
    }
  };

  window.setDestination = function (lat, lng) {
    var icon = L.divIcon({ className: 'dest-pin', html: '<div class="pin"></div>', iconSize: [22, 22], iconAnchor: [11, 22] });
    if (destMarker) {
      destMarker.setLatLng([lat, lng]);
    } else {
      destMarker = L.marker([lat, lng], { icon: icon }).addTo(map);
    }
  };

  window.clearRoutes = function () {
    routeLines.forEach(function (line) { map.removeLayer(line); });
    routeLines = [];
  };

  window.clearDestination = function () {
    if (destMarker) {
      map.removeLayer(destMarker);
      destMarker = null;
    }
  };

  window.centerOnUser = function () {
    if (userMarker) {
      map.setView(userMarker.getLatLng(), 16);
    }
  };

  send({ type: 'ready' });
</script>
</body>
</html>`;
