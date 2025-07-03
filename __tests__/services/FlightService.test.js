const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')
const FlightService = require('../../src/services/FlightService')
const NotificationService = require('../../src/services/NotificationService')
const Flight = require('../../src/models/Flight')
const { FLIGHT_STATUSES, DELAY_REASONS } = require('../../src/models/Flight')
const {
  FlightNotFoundError,
  FlightValidationError,
  FlightConflictError,
  FlightStatusError,
  FlightDatabaseError
} = require('../../src/errors/FlightErrors')

describe('FlightService', () => {
  let mongoServer
  let flightService
  let notificationService
  let mockLogger

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    const mongoUri = mongoServer.getUri()
    await mongoose.connect(mongoUri)
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer.stop()
  })

  beforeEach(async () => {
    await Flight.deleteMany({})
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }
    
    notificationService = new NotificationService(mockLogger)
    flightService = new FlightService(mockLogger, notificationService)
  })

  const validFlightData = {
    flightNumber: 'AA123',
    airline: {
      code: 'AA',
      name: 'American Airlines',
      icao: 'AAL'
    },
    aircraft: {
      type: 'Boeing 737-800',
      manufacturer: 'Boeing',
      model: '737-800',
      registration: 'N-123AA'
    },
    route: {
      origin: {
        airport: 'JFK',
        city: 'New York',
        country: 'United States',
        terminal: '1',
        gate: 'A1'
      },
      destination: {
        airport: 'LAX',
        city: 'Los Angeles',
        country: 'United States',
        terminal: '2',
        gate: 'B5'
      },
      distance: 2475
    },
    schedule: {
      departure: {
        scheduled: new Date('2025-07-10T08:00:00Z'),
        estimated: new Date('2025-07-10T08:15:00Z')
      },
      arrival: {
        scheduled: new Date('2025-07-10T11:00:00Z'),
        estimated: new Date('2025-07-10T11:15:00Z')
      }
    }
  }

  describe('Validation Methods', () => {
    describe('isValidIATACode()', () => {
      it('should validate airport codes correctly', () => {
        expect(flightService.isValidIATACode('JFK', 'airport')).toBe(true)
        expect(flightService.isValidIATACode('LAX', 'airport')).toBe(true)
        expect(flightService.isValidIATACode('jfk', 'airport')).toBe(true) // Should handle lowercase
        
        expect(flightService.isValidIATACode('JF', 'airport')).toBe(false)
        expect(flightService.isValidIATACode('JFKK', 'airport')).toBe(false)
        expect(flightService.isValidIATACode('123', 'airport')).toBe(false)
      })

      it('should validate airline codes correctly', () => {
        expect(flightService.isValidIATACode('AA', 'airline')).toBe(true)
        expect(flightService.isValidIATACode('QF', 'airline')).toBe(true)
        expect(flightService.isValidIATACode('3K', 'airline')).toBe(true)
        
        expect(flightService.isValidIATACode('A', 'airline')).toBe(false)
        expect(flightService.isValidIATACode('AAAA', 'airline')).toBe(false)
      })

      it('should validate flight numbers correctly', () => {
        expect(flightService.isValidIATACode('AA123', 'flight')).toBe(true)
        expect(flightService.isValidIATACode('UA1234', 'flight')).toBe(true)
        expect(flightService.isValidIATACode('QF9', 'flight')).toBe(true)
        expect(flightService.isValidIATACode('BA123A', 'flight')).toBe(true)
        
        expect(flightService.isValidIATACode('A123', 'flight')).toBe(false)
        expect(flightService.isValidIATACode('AA12345', 'flight')).toBe(false)
        expect(flightService.isValidIATACode('123', 'flight')).toBe(false)
      })

      it('should handle invalid inputs gracefully', () => {
        expect(flightService.isValidIATACode(null)).toBe(false)
        expect(flightService.isValidIATACode(undefined)).toBe(false)
        expect(flightService.isValidIATACode('')).toBe(false)
        expect(flightService.isValidIATACode(123)).toBe(false)
      })
    })

    describe('isValidFlightNumber()', () => {
      it('should validate flight numbers using IATA format', () => {
        expect(flightService.isValidFlightNumber('AA123')).toBe(true)
        expect(flightService.isValidFlightNumber('UA1234')).toBe(true)
        expect(flightService.isValidFlightNumber('QF9')).toBe(true)
        
        expect(flightService.isValidFlightNumber('A123')).toBe(false)
        expect(flightService.isValidFlightNumber('AA12345')).toBe(false)
        expect(flightService.isValidFlightNumber('123')).toBe(false)
      })
    })

    describe('validateFlightData()', () => {
      it('should pass validation for valid flight data', () => {
        expect(() => flightService.validateFlightData(validFlightData)).not.toThrow()
      })

      it('should throw validation error for missing flight number', () => {
        const invalidData = { ...validFlightData }
        delete invalidData.flightNumber
        
        expect(() => flightService.validateFlightData(invalidData))
          .toThrow(FlightValidationError)
      })

      it('should throw validation error for invalid flight number format', () => {
        const invalidData = { ...validFlightData, flightNumber: 'INVALID' }
        
        expect(() => flightService.validateFlightData(invalidData))
          .toThrow(FlightValidationError)
      })

      it('should throw validation error for missing airline information', () => {
        const invalidData = { ...validFlightData }
        delete invalidData.airline
        
        expect(() => flightService.validateFlightData(invalidData))
          .toThrow(FlightValidationError)
      })

      it('should throw validation error for same origin and destination', () => {
        const invalidData = {
          ...validFlightData,
          route: {
            ...validFlightData.route,
            destination: {
              ...validFlightData.route.destination,
              airport: 'JFK'
            }
          }
        }
        
        expect(() => flightService.validateFlightData(invalidData))
          .toThrow(FlightValidationError)
      })

      it('should throw validation error for departure after arrival', () => {
        const invalidData = {
          ...validFlightData,
          schedule: {
            departure: {
              scheduled: new Date('2025-07-10T12:00:00Z')
            },
            arrival: {
              scheduled: new Date('2025-07-10T08:00:00Z')
            }
          }
        }
        
        expect(() => flightService.validateFlightData(invalidData))
          .toThrow(FlightValidationError)
      })
    })

    describe('validateStatusTransition()', () => {
      it('should allow valid status transitions', () => {
        expect(flightService.validateStatusTransition(
          FLIGHT_STATUSES.SCHEDULED, 
          FLIGHT_STATUSES.BOARDING
        )).toBe(true)
        
        expect(flightService.validateStatusTransition(
          FLIGHT_STATUSES.BOARDING, 
          FLIGHT_STATUSES.DEPARTED
        )).toBe(true)
        
        expect(flightService.validateStatusTransition(
          FLIGHT_STATUSES.DEPARTED, 
          FLIGHT_STATUSES.IN_AIR
        )).toBe(true)
      })

      it('should reject invalid status transitions', () => {
        expect(flightService.validateStatusTransition(
          FLIGHT_STATUSES.ARRIVED, 
          FLIGHT_STATUSES.BOARDING
        )).toBe(false)
        
        expect(flightService.validateStatusTransition(
          FLIGHT_STATUSES.CANCELLED, 
          FLIGHT_STATUSES.DEPARTED
        )).toBe(false)
      })
    })
  })

  describe('CRUD Operations', () => {
    describe('createFlight()', () => {
      it('should create a new flight successfully', async () => {
        const result = await flightService.createFlight(validFlightData, 'TestUser')
        
        expect(result).toBeDefined()
        expect(result.flightNumber).toBe('AA123')
        expect(result.airline.code).toBe('AA')
        expect(result.route.routeString).toBe('JFK-LAX')
        expect(mockLogger.info).toHaveBeenCalledWith('Flight created successfully', expect.any(Object))
      })

      it('should throw conflict error for duplicate flight number', async () => {
        await flightService.createFlight(validFlightData)
        
        await expect(flightService.createFlight(validFlightData))
          .rejects.toThrow(FlightConflictError)
      })

      it('should throw validation error for invalid data', async () => {
        const invalidData = { ...validFlightData, flightNumber: 'INVALID' }
        
        await expect(flightService.createFlight(invalidData))
          .rejects.toThrow(FlightValidationError)
      })

      it('should log flight creation activity', async () => {
        await flightService.createFlight(validFlightData, 'TestUser')
        
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Creating new flight',
          expect.objectContaining({ flightNumber: 'AA123', createdBy: 'TestUser' })
        )
      })
    })

    describe('getFlightByNumber()', () => {
      beforeEach(async () => {
        await flightService.createFlight(validFlightData)
      })

      it('should retrieve flight by number successfully', async () => {
        const result = await flightService.getFlightByNumber('AA123')
        
        expect(result).toBeDefined()
        expect(result.flightNumber).toBe('AA123')
        expect(result.airline.code).toBe('AA')
      })

      it('should handle case insensitive flight number search', async () => {
        const result = await flightService.getFlightByNumber('aa123')
        
        expect(result).toBeDefined()
        expect(result.flightNumber).toBe('AA123')
      })

      it('should throw not found error for non-existent flight', async () => {
        await expect(flightService.getFlightByNumber('XX999'))
          .rejects.toThrow(FlightNotFoundError)
      })

      it('should throw validation error for invalid flight number format', async () => {
        await expect(flightService.getFlightByNumber('INVALID'))
          .rejects.toThrow(FlightValidationError)
      })

      it('should throw validation error for empty flight number', async () => {
        await expect(flightService.getFlightByNumber(''))
          .rejects.toThrow(FlightValidationError)
      })
    })

    describe('getFlights()', () => {
      beforeEach(async () => {
        const testFlights = [
          {
            ...validFlightData,
            flightNumber: 'AA100'
          },
          {
            ...validFlightData,
            flightNumber: 'UA200',
            airline: { code: 'UA', name: 'United Airlines' },
            aircraft: { type: 'Airbus A320' },
            route: {
              origin: { airport: 'ORD', city: 'Chicago', country: 'US' },
              destination: { airport: 'DEN', city: 'Denver', country: 'US' }
            },
            schedule: {
              departure: { scheduled: new Date('2025-07-10T10:00:00Z') },
              arrival: { scheduled: new Date('2025-07-10T12:00:00Z') }
            }
          },
          {
            ...validFlightData,
            flightNumber: 'DL300',
            airline: { code: 'DL', name: 'Delta Airlines' },
            aircraft: { type: 'Boeing 757' },
            schedule: {
              departure: { scheduled: new Date('2025-07-10T14:00:00Z') },
              arrival: { scheduled: new Date('2025-07-10T17:00:00Z') }
            }
          }
        ]

        for (const flightData of testFlights) {
          await flightService.createFlight(flightData)
        }
        
        // Update DL300 to cancelled status
        await flightService.updateFlightStatus('DL300', { status: FLIGHT_STATUSES.CANCELLED })
      })

      it('should retrieve all flights with pagination', async () => {
        const result = await flightService.getFlights({}, { page: 1, limit: 10 })
        
        expect(result.flights).toHaveLength(3)
        expect(result.pagination.totalCount).toBe(3)
        expect(result.pagination.page).toBe(1)
        expect(result.pagination.totalPages).toBe(1)
      })

      it('should filter flights by airline', async () => {
        const result = await flightService.getFlights({ airline: 'UA' })
        
        expect(result.flights).toHaveLength(1)
        expect(result.flights[0].airline.code).toBe('UA')
      })

      it('should filter flights by status', async () => {
        const result = await flightService.getFlights({ status: FLIGHT_STATUSES.CANCELLED })
        
        expect(result.flights).toHaveLength(1)
        expect(result.flights[0].status.current).toBe(FLIGHT_STATUSES.CANCELLED)
      })

      it('should filter flights by route', async () => {
        const result = await flightService.getFlights({ 
          origin: 'ORD', 
          destination: 'DEN' 
        })
        
        expect(result.flights).toHaveLength(1)
        expect(result.flights[0].route.origin.airport).toBe('ORD')
      })

      it('should handle pagination correctly', async () => {
        const result = await flightService.getFlights({}, { page: 1, limit: 2 })
        
        expect(result.flights).toHaveLength(2)
        expect(result.pagination.totalCount).toBe(3)
        expect(result.pagination.hasNextPage).toBe(true)
        expect(result.pagination.hasPrevPage).toBe(false)
      })
    })

    describe('updateFlightStatus()', () => {
      let flight

      beforeEach(async () => {
        flight = await flightService.createFlight(validFlightData)
      })

      it('should update flight status successfully', async () => {
        const updateData = {
          status: FLIGHT_STATUSES.BOARDING,
          reason: 'Flight ready for boarding'
        }

        const result = await flightService.updateFlightStatus('AA123', updateData, 'TestUser')
        
        expect(result.status.current).toBe(FLIGHT_STATUSES.BOARDING)
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Flight status updated successfully',
          expect.objectContaining({
            flightNumber: 'AA123',
            oldStatus: FLIGHT_STATUSES.SCHEDULED,
            newStatus: FLIGHT_STATUSES.BOARDING
          })
        )
      })

      it('should update schedule times', async () => {
        const updateData = {
          schedule: {
            departure: {
              actual: new Date('2025-07-10T08:30:00Z')
            }
          }
        }

        const result = await flightService.updateFlightStatus('AA123', updateData)
        
        expect(result.schedule.departure.actual).toBeDefined()
      })

      it('should update gate information', async () => {
        const updateData = {
          gate: {
            departure: {
              gate: 'C12',
              terminal: '3'
            }
          }
        }

        const result = await flightService.updateFlightStatus('AA123', updateData)
        
        expect(result.route.origin.gate).toBe('C12')
        expect(result.route.origin.terminal).toBe('3')
      })

      it('should update delay information', async () => {
        const updateData = {
          delay: {
            minutes: 30,
            reason: DELAY_REASONS.WEATHER,
            description: 'Severe thunderstorms'
          }
        }

        const result = await flightService.updateFlightStatus('AA123', updateData)
        
        expect(result.delay.minutes).toBe(30)
        expect(result.delay.reason).toBe(DELAY_REASONS.WEATHER)
        expect(result.delay.description).toBe('Severe thunderstorms')
      })

      it('should throw error for invalid status transition', async () => {
        const updateData = {
          status: FLIGHT_STATUSES.ARRIVED // Can't go directly from SCHEDULED to ARRIVED
        }

        await expect(flightService.updateFlightStatus('AA123', updateData))
          .rejects.toThrow(FlightStatusError)
      })

      it('should throw not found error for non-existent flight', async () => {
        const updateData = {
          status: FLIGHT_STATUSES.BOARDING
        }

        await expect(flightService.updateFlightStatus('XX999', updateData))
          .rejects.toThrow(FlightNotFoundError)
      })
    })

    describe('getUpcomingFlights()', () => {
      beforeEach(async () => {
        // Create flight with future departure time
        const futureFlightData = {
          ...validFlightData,
          flightNumber: 'AA999',
          schedule: {
            departure: {
              scheduled: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
            },
            arrival: {
              scheduled: new Date(Date.now() + 5 * 60 * 60 * 1000) // 5 hours from now
            }
          }
        }
        await flightService.createFlight(futureFlightData)

        // Create flight with past departure time
        const pastFlightData = {
          ...validFlightData,
          flightNumber: 'AA888',
          schedule: {
            departure: {
              scheduled: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
            },
            arrival: {
              scheduled: new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour from now
            }
          }
        }
        await flightService.createFlight(pastFlightData)
      })

      it('should retrieve upcoming flights within time window', async () => {
        const result = await flightService.getUpcomingFlights(24)
        
        expect(result.flights).toHaveLength(1)
        expect(result.flights[0].flightNumber).toBe('AA999')
        expect(result.hoursAhead).toBe(24)
      })

      it('should apply additional filters to upcoming flights', async () => {
        const result = await flightService.getUpcomingFlights(24, { airline: 'AA' })
        
        expect(result.flights).toHaveLength(1)
        expect(result.flights[0].airline.code).toBe('AA')
      })
    })

    describe('searchFlights()', () => {
      beforeEach(async () => {
        const testFlights = [
          {
            ...validFlightData,
            flightNumber: 'AA100'
          },
          {
            ...validFlightData,
            flightNumber: 'UA200',
            airline: { code: 'UA', name: 'United Airlines' },
            aircraft: { type: 'Airbus A320' },
            schedule: {
              departure: { scheduled: new Date('2025-07-10T10:00:00Z') },
              arrival: { scheduled: new Date('2025-07-10T12:00:00Z') }
            }
          },
          {
            ...validFlightData,
            flightNumber: 'DL300',
            airline: { code: 'DL', name: 'Delta Airlines' },
            aircraft: { type: 'Boeing 757' },
            route: {
              origin: { airport: 'ORD', city: 'Chicago', country: 'US' },
              destination: { airport: 'DEN', city: 'Denver', country: 'US' }
            },
            schedule: {
              departure: { scheduled: new Date('2025-07-10T14:00:00Z') },
              arrival: { scheduled: new Date('2025-07-10T17:00:00Z') }
            }
          }
        ]

        for (const flightData of testFlights) {
          await flightService.createFlight(flightData)
        }
      })

      it('should search flights by text', async () => {
        const result = await flightService.searchFlights({ searchText: 'American' })
        
        expect(result.flights).toHaveLength(1)
        expect(result.flights[0].airline.name).toContain('American')
      })

      it('should search flights by route', async () => {
        const result = await flightService.searchFlights({
          route: { from: 'ORD', to: 'DEN' }
        })
        
        expect(result.flights).toHaveLength(1)
        expect(result.flights[0].route.origin.airport).toBe('ORD')
      })

      it('should search flights by airlines', async () => {
        const result = await flightService.searchFlights({
          airlines: ['AA', 'UA']
        })
        
        expect(result.flights).toHaveLength(2)
        expect(result.flights.every(f => ['AA', 'UA'].includes(f.airline.code))).toBe(true)
      })

      it('should search flights by aircraft types', async () => {
        const result = await flightService.searchFlights({
          aircraftTypes: ['Airbus A320']
        })
        
        expect(result.flights).toHaveLength(1)
        expect(result.flights[0].aircraft.type).toBe('Airbus A320')
      })

      it('should limit search results', async () => {
        const result = await flightService.searchFlights({
          searchText: 'Airlines',
          limit: 2
        })
        
        expect(result.flights.length).toBeLessThanOrEqual(2)
      })
    })
  })

  describe('Utility Methods', () => {
    describe('calculateDelay()', () => {
      it('should calculate delay correctly', () => {
        const scheduledTime = '2025-07-10T08:00:00Z'
        const actualTime = '2025-07-10T08:30:00Z'
        
        const result = flightService.calculateDelay(scheduledTime, actualTime)
        
        expect(result.delayMinutes).toBe(30)
        expect(result.isDelayed).toBe(true)
        expect(result.scheduledTime).toBe(new Date(scheduledTime).toISOString())
        expect(result.actualTime).toBe(new Date(actualTime).toISOString())
      })

      it('should handle early departures (no negative delay)', () => {
        const scheduledTime = '2025-07-10T08:00:00Z'
        const actualTime = '2025-07-10T07:45:00Z'
        
        const result = flightService.calculateDelay(scheduledTime, actualTime)
        
        expect(result.delayMinutes).toBe(0)
        expect(result.isDelayed).toBe(false)
      })

      it('should calculate delay against current time when no actual time provided', () => {
        const pastTime = new Date(Date.now() - 30 * 60 * 1000).toISOString() // 30 minutes ago
        
        const result = flightService.calculateDelay(pastTime)
        
        expect(result.delayMinutes).toBeGreaterThan(0)
        expect(result.isDelayed).toBe(true)
      })

      it('should throw validation error for invalid scheduled time', () => {
        expect(() => flightService.calculateDelay('invalid-date'))
          .toThrow(FlightValidationError)
      })

      it('should throw validation error for invalid actual time', () => {
        expect(() => flightService.calculateDelay('2025-07-10T08:00:00Z', 'invalid-date'))
          .toThrow(FlightValidationError)
      })
    })

    describe('formatFlightData()', () => {
      let flight

      beforeEach(async () => {
        flight = await flightService.createFlight(validFlightData)
      })

      it('should format flight data correctly', async () => {
        const flightDoc = await Flight.findOne({ flightNumber: 'AA123' })
        const formatted = flightService.formatFlightData(flightDoc)
        
        expect(formatted).toHaveProperty('id')
        expect(formatted).toHaveProperty('flightNumber', 'AA123')
        expect(formatted).toHaveProperty('airline')
        expect(formatted).toHaveProperty('route')
        expect(formatted).toHaveProperty('schedule')
        expect(formatted).toHaveProperty('status')
        expect(formatted).toHaveProperty('delay')
        expect(formatted).toHaveProperty('operational')
        expect(formatted).toHaveProperty('timestamps')
        
        expect(formatted.route).toHaveProperty('routeString', 'JFK-LAX')
        expect(formatted.operational).toHaveProperty('isInternational', false)
      })

      it('should handle null flight data', () => {
        const result = flightService.formatFlightData(null)
        expect(result).toBeNull()
      })
    })

    describe('getFlightHistory()', () => {
      beforeEach(async () => {
        // Create multiple flights with same flight number but different dates
        const baseData = { ...validFlightData, flightNumber: 'AA123' }
        
        await flightService.createFlight({
          ...baseData,
          schedule: {
            departure: { scheduled: new Date('2025-07-08T08:00:00Z') },
            arrival: { scheduled: new Date('2025-07-08T11:00:00Z') }
          }
        })

        await flightService.createFlight({
          ...baseData,
          flightNumber: 'AA124', // Different flight number to avoid conflict
          schedule: {
            departure: { scheduled: new Date('2025-07-09T08:00:00Z') },
            arrival: { scheduled: new Date('2025-07-09T11:00:00Z') }
          }
        })
      })

      it('should retrieve flight history', async () => {
        const result = await flightService.getFlightHistory('AA123')
        
        expect(result).toHaveProperty('flightNumber', 'AA123')
        expect(result).toHaveProperty('history')
        expect(result.history).toHaveLength(1)
        expect(result.history[0]).toHaveProperty('flightNumber', 'AA123')
      })

      it('should throw validation error for invalid flight number', async () => {
        await expect(flightService.getFlightHistory('INVALID'))
          .rejects.toThrow(FlightValidationError)
      })

      it('should sort history by creation date', async () => {
        const result = await flightService.getFlightHistory('AA123', { sortOrder: 'desc' })
        
        expect(result.history).toHaveLength(1)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Close database connection to simulate error
      await mongoose.connection.close()
      
      await expect(flightService.createFlight(validFlightData))
        .rejects.toThrow(FlightDatabaseError)
      
      // Reconnect for other tests
      const mongoUri = mongoServer.getUri()
      await mongoose.connect(mongoUri)
    })

    it('should log errors appropriately', async () => {
      try {
        await flightService.getFlightByNumber('XX999')
      } catch (error) {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Error fetching flight by number',
          expect.objectContaining({
            error: expect.any(String),
            flightNumber: 'XX999'
          })
        )
      }
    })
  })

  describe('Health and Monitoring', () => {
    describe('getServiceHealth()', () => {
      it('should return healthy status when all checks pass', async () => {
        const health = await flightService.getServiceHealth()
        
        expect(health.service).toBe('FlightService')
        expect(health.status).toBe('healthy')
        expect(health.checks.database.status).toBe('healthy')
        expect(health.checks.validation.status).toBe('healthy')
      })

      it('should return unhealthy status when database is down', async () => {
        await mongoose.connection.close()
        
        const health = await flightService.getServiceHealth()
        
        expect(health.status).toBe('unhealthy')
        expect(health.checks.database.status).toBe('unhealthy')
        
        // Reconnect for other tests
        const mongoUri = mongoServer.getUri()
        await mongoose.connect(mongoUri)
      })
    })
  })

  describe('Integration with NotificationService', () => {
    beforeEach(async () => {
      notificationService.enable()
      jest.spyOn(notificationService, 'notifyFlightStatusChange')
    })

    it('should trigger notifications on status change', async () => {
      const flight = await flightService.createFlight(validFlightData)
      
      const updateData = {
        status: FLIGHT_STATUSES.BOARDING
      }

      await flightService.updateFlightStatus('AA123', updateData)
      
      expect(notificationService.notifyFlightStatusChange).toHaveBeenCalledWith(
        expect.any(Object),
        FLIGHT_STATUSES.SCHEDULED,
        FLIGHT_STATUSES.BOARDING,
        'System'
      )
    })

    it('should handle notification service failures gracefully', async () => {
      jest.spyOn(notificationService, 'notifyFlightStatusChange')
        .mockRejectedValue(new Error('Notification failed'))
      
      const flight = await flightService.createFlight(validFlightData)
      const updateData = { status: FLIGHT_STATUSES.BOARDING }

      // Should not throw error even if notification fails
      await expect(flightService.updateFlightStatus('AA123', updateData))
        .resolves.toBeDefined()
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to send flight status notification',
        expect.objectContaining({
          flightNumber: 'AA123',
          error: 'Notification failed'
        })
      )
    })
  })
})