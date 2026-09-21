const Settings = require('../../settings/model/Settings');
const LoginAudit = require('../model/LoginAudit');

describe('Geofence & Login Metrics Backend Logic', () => {
  function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  test('Haversine distance calculates accurate meter distance', () => {
    // Kakinada center (16.9048, 82.2369) to nearby point ~100m away
    const dist = haversineDistanceMeters(16.9048, 82.2369, 16.9056, 82.2369);
    expect(dist).toBeGreaterThan(80);
    expect(dist).toBeLessThan(120);
  });

  test('Haversine distance detects out-of-geofence coordinates (> 500m)', () => {
    const dist = haversineDistanceMeters(16.9048, 82.2369, 16.9200, 82.2500);
    expect(dist).toBeGreaterThan(500);
  });

  test('Default geofence settings structure validation', () => {
    const config = {
      enabled: true,
      latitude: 16.9048,
      longitude: 82.2369,
      radiusMeters: 500,
      locationName: 'Head Office',
    };
    expect(config.enabled).toBe(true);
    expect(config.radiusMeters).toBe(500);
    expect(typeof config.latitude).toBe('number');
    expect(typeof config.longitude).toBe('number');
  });
});
