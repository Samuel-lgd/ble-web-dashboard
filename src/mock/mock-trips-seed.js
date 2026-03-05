/**
 * @file Seed 2 demo trips (Toulouse ↔ Blagnac) into TripStorage.
 * Only inserts if those specific IDs don't already exist.
 * Called once at startup in mock mode.
 *
 * @param {import('../trips/trip-storage.js').TripStorage} storage
 */
export async function seedMockTrips(storage) {
  // Check whether the first seed trip already exists to avoid duplicates
  const existing = await storage.load('mock-trip-tlse-blagnac-01');
  if (existing) return;

  const MOCK_TRIPS = [
    // ── Trip 1: Toulouse Capitole → Blagnac Aéroport ──────────────────────
    {
      id: 'mock-trip-tlse-blagnac-01',
      startTime: _daysAgo(1, 8, 10),   // yesterday 08:10
      endTime:   _daysAgo(1, 8, 33),   // yesterday 08:33  (+23 min)
      status: 'completed',
      route: _buildRoute([
        [43.6042, 1.4437],  // Capitole
        [43.6085, 1.4320],  // Rue Alsace-Lorraine
        [43.6155, 1.4210],  // Bd Déodat de Séverac
        [43.6260, 1.3990],  // Route de Blagnac
        [43.6345, 1.3960],  // Entrée Blagnac
        [43.6367, 1.3936],  // Aéroport Toulouse-Blagnac
      ], _daysAgo(1, 8, 10)),
      snapshots: [],
      stats: {
        distanceKm:               12.4,
        durationSeconds:          1380,    // 23 min
        fuelConsumedL:             0.71,
        fuelCostEur:               1.31,
        avgSpeedKmh:               32.2,
        maxSpeedKmh:               87.0,
        avgConsumptionL100km:       5.7,
        instantConsumptionL100km:   5.7,
        electricConsumptionWh:    1840,
        evModePercent:             58,
        avgHybridSOC:              61,
        socDelta:                  -4.2,
        regenEnergyWh:             310,
        engineOnPercent:           42,
        avgCoolantTemp:            72,
        idleTimeSeconds:           120,
        hardBrakingCount:            2,
        hardAccelerationCount:       1,
        maxRpm:                   3200,
        co2EmittedGrams:          1650,
        savedCo2Grams:             835,
        boundingBox: {
          north: 43.6367, south: 43.6042,
          east: 1.4437,   west: 1.3936,
        },
        startAddress: 'Place du Capitole, Toulouse, Haute-Garonne, Occitanie, France',
        endAddress:   'Aéroport Toulouse-Blagnac, Blagnac, Haute-Garonne, Occitanie, France',
        startLocation: {
          city:   'Toulouse',
          suburb: 'Capitole',
          full:   'Place du Capitole, Toulouse, Haute-Garonne, Occitanie, France',
        },
        endLocation: {
          city:   'Blagnac',
          suburb: 'Aéroport',
          full:   'Aéroport Toulouse-Blagnac, Blagnac, Haute-Garonne, Occitanie, France',
        },
      },
      meta: {
        label: null,
        notes: null,
        tags: ['city', 'ev-dominant'],
        fuelPricePerLiter: 1.85,
        weather: {
          tempC: 11,
          condition: 'Nuageux',
          windKmh: 14,
        },
      },
    },

    // ── Trip 2: Blagnac Mairie → Toulouse Saint-Cyprien ───────────────────
    {
      id: 'mock-trip-blagnac-tlse-02',
      startTime: _daysAgo(0, 7, 45),   // today 07:45
      endTime:   _daysAgo(0, 8,  9),   // today 08:09  (+24 min)
      status: 'completed',
      route: _buildRoute([
        [43.6358, 1.3940],  // Blagnac Centre / Mairie
        [43.6300, 1.3990],  // Bd Abel Auger
        [43.6220, 1.4080],  // Bd de Suisse
        [43.6135, 1.4195],  // Allées Jean-Jaurès
        [43.6010, 1.4310],  // Toulouse Saint-Cyprien
        [43.5985, 1.4290],  // Quai de Tounis
      ], _daysAgo(0, 7, 45)),
      snapshots: [],
      stats: {
        distanceKm:               13.1,
        durationSeconds:          1440,    // 24 min
        fuelConsumedL:             0.83,
        fuelCostEur:               1.54,
        avgSpeedKmh:               32.8,
        maxSpeedKmh:               76.0,
        avgConsumptionL100km:       6.3,
        instantConsumptionL100km:   6.3,
        electricConsumptionWh:    1620,
        evModePercent:             47,
        avgHybridSOC:              57,
        socDelta:                  -5.1,
        regenEnergyWh:             270,
        engineOnPercent:           53,
        avgCoolantTemp:            78,
        idleTimeSeconds:           145,
        hardBrakingCount:            3,
        hardAccelerationCount:       2,
        maxRpm:                   3450,
        co2EmittedGrams:          1930,
        savedCo2Grams:             640,
        boundingBox: {
          north: 43.6358, south: 43.5985,
          east: 1.4310,   west: 1.3940,
        },
        startAddress: 'Mairie de Blagnac, Place Marcel Doret, Blagnac, Haute-Garonne, France',
        endAddress:   'Rue de Metz, Saint-Cyprien, Toulouse, Haute-Garonne, France',
        startLocation: {
          city:   'Blagnac',
          suburb: 'Centre',
          full:   'Mairie de Blagnac, Place Marcel Doret, Blagnac, Haute-Garonne, France',
        },
        endLocation: {
          city:   'Toulouse',
          suburb: 'Saint-Cyprien',
          full:   'Rue de Metz, Saint-Cyprien, Toulouse, Haute-Garonne, France',
        },
      },
      meta: {
        label: null,
        notes: null,
        tags: ['city'],
        fuelPricePerLiter: 1.85,
        weather: {
          tempC: 9,
          condition: 'Ensoleillé',
          windKmh: 8,
        },
      },
    },
  ];

  for (const trip of MOCK_TRIPS) {
    await storage.save(trip).catch(() => {});
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Return ISO string N days ago at HH:MM local time. */
function _daysAgo(daysBack, hours, minutes) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

/** Build a minimal GeoPoint array from [lat,lng] pairs, spaced 2 min apart. */
function _buildRoute(coords, startIso) {
  const start = new Date(startIso).getTime();
  return coords.map(([lat, lng], i) => ({
    lat,
    lng,
    timestamp: new Date(start + i * 120_000).toISOString(),
    speed: 35 + Math.random() * 20,
    altitude: 140 + Math.random() * 10,
  }));
}
