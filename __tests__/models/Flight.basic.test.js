const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

describe('Flight Model Basic Tests', () => {
  let mongoServer
  let Flight, FLIGHT_STATUSES, DELAY_REASONS

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    const mongoUri = mongoServer.getUri()
    await mongoose.connect(mongoUri)
    
    const FlightModule = require('../../src/models/Flight')
    Flight = FlightModule
    FLIGHT_STATUSES = FlightModule.FLIGHT_STATUSES
    DELAY_REASONS = FlightModule.DELAY_REASONS
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer.stop()
  })

  beforeEach(async () => {
    await Flight.deleteMany({})
  })

  const validFlightData = {
    flightNumber: 'AA123',
    airline: {
      code: 'AA',
      name: 'American Airlines'
    },
    aircraft: {
      type: 'Boeing 737-800'
    },
    route: {
      origin: {
        airport: 'JFK',
        city: 'New York',
        country: 'United States'
      },
      destination: {
        airport: 'LAX',
        city: 'Los Angeles',
        country: 'United States'
      }
    },
    schedule: {
      departure: {
        scheduled: new Date('2025-07-10T08:00:00Z')
      },
      arrival: {
        scheduled: new Date('2025-07-10T11:00:00Z')
      }
    }
  }

  describe('Basic Schema Validation', () => {
    it('should create a valid flight', async () => {
      const flight = new Flight(validFlightData)
      const savedFlight = await flight.save()

      expect(savedFlight._id).toBeDefined()
      expect(savedFlight.flightNumber).toBe('AA123')
      expect(savedFlight.airline.code).toBe('AA')
      expect(savedFlight.status.current).toBe(FLIGHT_STATUSES.SCHEDULED)
    })

    it('should validate IATA flight number format', async () => {
      const flight = new Flight({
        ...validFlightData,
        flightNumber: 'INVALID'
      })

      await expect(flight.save()).rejects.toThrow(/IATA format/)
    })

    it('should validate airport codes', async () => {
      const flight = new Flight({
        ...validFlightData,
        route: {
          ...validFlightData.route,
          origin: {
            ...validFlightData.route.origin,
            airport: 'INVALID'
          }
        }
      })

      await expect(flight.save()).rejects.toThrow(/IATA code/)
    })

    it('should prevent same origin and destination', async () => {
      const flight = new Flight({
        ...validFlightData,
        route: {
          ...validFlightData.route,
          destination: {
            ...validFlightData.route.destination,
            airport: 'JFK'
          }
        }
      })

      await expect(flight.save()).rejects.toThrow(/same/)
    })
  })

  describe('Virtual Fields', () => {
    it('should calculate duration virtual field', async () => {
      const flight = new Flight(validFlightData)
      expect(flight.duration).toBe(180) // 3 hours = 180 minutes
    })

    it('should calculate route string', async () => {
      const flight = new Flight(validFlightData)
      expect(flight.routeString).toBe('JFK-LAX')
    })

    it('should determine if flight is delayed', async () => {
      const flight = new Flight(validFlightData)
      expect(flight.isDelayed).toBe(false)
      
      flight.delay.minutes = 30
      expect(flight.isDelayed).toBe(true)
    })
  })

  describe('Instance Methods', () => {
    it('should calculate delay correctly', async () => {
      const flight = new Flight(validFlightData)
      await flight.save()

      flight.schedule.departure.actual = new Date('2025-07-10T08:30:00Z')
      const delay = flight.calculateDelay()
      
      expect(delay).toBe(30)
      expect(flight.delay.minutes).toBe(30)
    })

    it('should update flight status', async () => {
      const flight = new Flight(validFlightData)
      await flight.save()

      await flight.updateStatus(FLIGHT_STATUSES.BOARDING)
      
      expect(flight.status.current).toBe(FLIGHT_STATUSES.BOARDING)
      expect(flight.status.history).toHaveLength(1)
    })
  })

  describe('Static Methods', () => {
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
          route: {
            origin: { airport: 'ORD', city: 'Chicago', country: 'US' },
            destination: { airport: 'DEN', city: 'Denver', country: 'US' }
          },
          delay: { minutes: 30, reason: DELAY_REASONS.WEATHER }
        }
      ]

      await Flight.insertMany(testFlights)
    })

    it('should find flights by route', async () => {
      const flights = await Flight.findByRoute('JFK', 'LAX')
      expect(flights).toHaveLength(1)
      expect(flights[0].flightNumber).toBe('AA100')
    })

    it('should find flights by airline', async () => {
      const flights = await Flight.findByAirline('UA')
      expect(flights).toHaveLength(1)
      expect(flights[0].flightNumber).toBe('UA200')
    })

    it('should find delayed flights', async () => {
      const flights = await Flight.findDelayed(15)
      expect(flights).toHaveLength(1)
      expect(flights[0].flightNumber).toBe('UA200')
    })
  })
})