/**
 * @file JSDoc type definitions for the trip recording engine.
 */

/**
 * @typedef {Object} GeoPoint
 * @property {number} lat - Latitude in decimal degrees.
 * @property {number} lng - Longitude in decimal degrees.
 * @property {number} timestamp - ISO 8601 timestamp string.
 * @property {number} speed - Speed at this point in km/h.
 * @property {number|null} altitude - Altitude in meters, or null if unavailable.
 */

/**
 * @typedef {Object} Snapshot
 * @property {string} timestamp - ISO 8601 timestamp.
 * @property {number|null} odometer - Computed distance from trip start in km.
 * @property {number|null} speed - Vehicle speed in km/h.
 * @property {number|null} rpm - Engine RPM.
 * @property {number|null} coolantTemp - Coolant temperature in degrees C.
 * @property {number|null} intakeTemp - Intake air temperature in degrees C.
 * @property {number|null} throttle - Throttle position in percent.
 * @property {number|null} fuelRate - Fuel consumption rate in L/h (PID 015E).
 * @property {number|null} hybridSOC - Hybrid battery state of charge in percent.
 * @property {number|null} hybridCurrent - HV battery current in amps.
 * @property {number|null} hybridVoltage - HV battery voltage in volts.
 * @property {number|null} hybridBatteryTemp - HV battery temperature in degrees C.
 * @property {number|null} mg1Rpm - MG1 (generator) RPM.
 * @property {number|null} mg2Rpm - MG2 (motor) RPM.
 * @property {number|null} mg1Torque - MG1 torque in Nm.
 * @property {number|null} mg2Torque - MG2 torque in Nm.
 * @property {boolean|null} evMode - Whether the vehicle is in EV mode.
 * @property {number|null} regenTorque - Regenerative braking torque in Nm.
 * @property {number|null} ambientTemp - Ambient air temperature in degrees C.
 * @property {number|null} fuelLoad - Engine absolute load in percent.
 * @property {number|null} lat - GPS latitude, if available.
 * @property {number|null} lng - GPS longitude, if available.
 * @property {number|null} altitude - GPS altitude in meters, if available.
 */

/**
 * @typedef {Object} BoundingBox
 * @property {number} north - Maximum latitude.
 * @property {number} south - Minimum latitude.
 * @property {number} east - Maximum longitude.
 * @property {number} west - Minimum longitude.
 */

/**
 * @typedef {Object} TripStats
 * @property {number} distanceKm - Total distance traveled in km.
 * @property {number} durationSeconds - Total trip duration in seconds.
 * @property {number} fuelConsumedL - Total fuel consumed in liters.
 * @property {number} fuelCostEur - Fuel cost in EUR: fuelConsumedL * pricePerLiter.
 * @property {number} avgSpeedKmh - Average speed in km/h.
 * @property {number} maxSpeedKmh - Maximum speed in km/h.
 * @property {number} avgConsumptionL100km - Average fuel consumption in L/100km.
 * @property {number} instantConsumptionL100km - Rolling 10s window consumption in L/100km.
 * @property {number} electricConsumptionWh - Integrated electric energy in Wh.
 * @property {number} evModePercent - Percentage of trip time in EV mode.
 * @property {number} avgHybridSOC - Average hybrid battery SOC.
 * @property {number} socDelta - SOC change (end - start), negative means discharged.
 * @property {number} regenEnergyWh - Energy recovered via regenerative braking in Wh.
 * @property {number} engineOnPercent - Percentage of trip time with engine running.
 * @property {number} avgCoolantTemp - Average coolant temperature in degrees C.
 * @property {number} idleTimeSeconds - Time with speed=0 and engine running in seconds.
 * @property {number} hardBrakingCount - Count of decelerations > 3 m/s^2.
 * @property {number} hardAccelerationCount - Count of accelerations > 3 m/s^2.
 * @property {number} maxRpm - Maximum engine RPM recorded.
 * @property {number} co2EmittedGrams - Estimated CO2 emitted in grams.
 * @property {number} savedCo2Grams - Estimated CO2 saved vs pure ICE in grams.
 * @property {BoundingBox|null} boundingBox - GPS bounding box, or null if no GPS data.
 * @property {string|null} startAddress - Reverse geocoded start address.
 * @property {string|null} endAddress - Reverse geocoded end address.
 */

/**
 * @typedef {Object} WeatherInfo
 * @property {number} tempC - Temperature in degrees C.
 * @property {string} condition - Weather condition description.
 * @property {number} windKmh - Wind speed in km/h.
 */

/**
 * @typedef {Object} TripMeta
 * @property {string|null} label - User-defined trip name.
 * @property {string|null} notes - User notes.
 * @property {string[]} tags - Tags (e.g. "highway", "city", "cold-start").
 * @property {number} fuelPricePerLiter - Fuel price snapshot at trip time.
 * @property {WeatherInfo|null} weather - Weather conditions, or null if unavailable.
 */

/**
 * @typedef {Object} Trip
 * @property {string} id - UUID v4 identifier.
 * @property {string} startTime - ISO 8601 start timestamp.
 * @property {string|null} endTime - ISO 8601 end timestamp, null while recording.
 * @property {"recording"|"completed"|"interrupted"} status - Trip lifecycle status.
 * @property {GeoPoint[]} route - GPS track points.
 * @property {Snapshot[]} snapshots - Raw OBD data snapshots.
 * @property {TripStats} stats - Computed trip statistics.
 * @property {TripMeta} meta - User metadata and weather.
 */

/**
 * @typedef {Object} TripSummary
 * @property {string} id
 * @property {string} startTime
 * @property {string|null} endTime
 * @property {"recording"|"completed"|"interrupted"} status
 * @property {TripStats} stats
 * @property {TripMeta} meta
 */

/**
 * @typedef {Object} TripConfig
 * @property {number} fuelPricePerLiter - EUR per liter.
 * @property {"petrol"|"diesel"|"hybrid"} fuelType
 * @property {string} vehicleName
 * @property {number} co2PerLiterPetrol - Grams CO2 per liter of petrol.
 * @property {number} pureIceCo2Per100km - Reference ICE vehicle g CO2/km for savings calc.
 * @property {boolean} autoStartTrip
 * @property {number} autoStopDelay - Seconds of inactivity before auto-stop.
 * @property {number} snapshotIntervalMs - Recording frequency in ms.
 * @property {boolean} gpsEnabled
 * @property {boolean} weatherEnabled
 * @property {number} storageWarningThresholdPercent
 */
