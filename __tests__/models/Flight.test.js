const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

describe('Flight Model', () => {
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

  describe('Schema Validation', () => {
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
        registration: 'N123AA',
        capacity: {
          economy: 150,
          business: 20,
          first: 8,
          total: 178
        }
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

    it('should create a valid flight', async () => {
      const flight = new Flight(validFlightData)
      const savedFlight = await flight.save()

      expect(savedFlight._id).toBeDefined()
      expect(savedFlight.flightNumber).toBe('AA123')
      expect(savedFlight.airline.code).toBe('AA')
      expect(savedFlight.status.current).toBe(FLIGHT_STATUSES.SCHEDULED)
    })

    it('should validate IATA flight number format', async () => {
      const invalidFlightNumbers = ['A123', '123', 'AAA123', '12ABC', 'AA12345']

      for (const flightNumber of invalidFlightNumbers) {
        const flight = new Flight({
          ...validFlightData,
          flightNumber
        })

        await expect(flight.save()).rejects.toThrow(/IATA format/)
      }
    })

    it('should accept valid IATA flight number formats', async () => {
      const validFlightNumbers = ['AA123', 'UA1234', 'QF9', 'BA123A']

      for (const flightNumber of validFlightNumbers) {
        const flight = new Flight({
          ...validFlightData,
          flightNumber
        })

        const savedFlight = await flight.save()
        expect(savedFlight.flightNumber).toBe(flightNumber)
        await Flight.deleteOne({ _id: savedFlight._id })
      }
    })

    it('should validate IATA airport codes', async () => {
      const invalidAirportCodes = ['JF', 'JFKK', '123', 'jfk', 'A1B']

      for (const airportCode of invalidAirportCodes) {
        const flight = new Flight({
          ...validFlightData,
          route: {
            ...validFlightData.route,
            origin: {
              ...validFlightData.route.origin,
              airport: airportCode
            }
          }
        })

        await expect(flight.save()).rejects.toThrow(/IATA code/)
      }
    })

    it('should validate airline codes', async () => {
      const invalidAirlineCodes = ['A', 'AAAA', '1', 'AA1B']

      for (const airlineCode of invalidAirlineCodes) {
        const flight = new Flight({
          ...validFlightData,
          airline: {
            ...validFlightData.airline,
            code: airlineCode
          }
        })

        await expect(flight.save()).rejects.toThrow(/airline code/)
      }
    })

    it('should validate aircraft registration format', async () => {
      const invalidRegistrations = ['N123', 'ABC-123', '123-ABC', 'N-123AB']

      for (const registration of invalidRegistrations) {
        const flight = new Flight({
          ...validFlightData,
          aircraft: {
            ...validFlightData.aircraft,
            registration
          }
        })

        await expect(flight.save()).rejects.toThrow(/registration/)
      }
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

    it('should prevent departure after arrival', async () => {
      const flight = new Flight({
        ...validFlightData,
        schedule: {
          departure: {
            scheduled: new Date('2025-07-10T12:00:00Z')
          },
          arrival: {
            scheduled: new Date('2025-07-10T08:00:00Z')
          }
        }
      })

      await expect(flight.save()).rejects.toThrow(/before arrival/)
    })
  })

  describe('Virtual Fields', () => {
    let flight

    beforeEach(async () => {
      flight = new Flight({
        flightNumber: 'AA123',
        airline: { code: 'AA', name: 'American Airlines' },
        aircraft: { type: 'Boeing 737' },
        route: {
          origin: { airport: 'JFK', city: 'New York', country: 'US' },
          destination: { airport: 'LAX', city: 'Los Angeles', country: 'US' }
        },
        schedule: {
          departure: { scheduled: new Date('2025-07-10T08:00:00Z') },
          arrival: { scheduled: new Date('2025-07-10T11:00:00Z') }
        }
      })
    })

    it('should calculate duration virtual field', () => {
      expect(flight.duration).toBe(180) // 3 hours = 180 minutes
    })

    it('should calculate isDelayed virtual field', () => {
      expect(flight.isDelayed).toBe(false)
      
      flight.delay.minutes = 30
      expect(flight.isDelayed).toBe(true)
    })

    it('should calculate isInternational virtual field', () => {
      expect(flight.isInternational).toBe(false)
      
      flight.route.destination.country = 'Canada'
      expect(flight.isInternational).toBe(true)
    })

    it('should generate routeString virtual field', () => {
      expect(flight.routeString).toBe('JFK-LAX')
    })

    it('should generate fullFlightNumber virtual field', () => {
      expect(flight.fullFlightNumber).toBe('AA123')
    })

    it('should calculate estimatedDuration when estimated times exist', () => {
      flight.schedule.departure.estimated = new Date('2025-07-10T08:15:00Z')
      flight.schedule.arrival.estimated = new Date('2025-07-10T11:30:00Z')
      
      expect(flight.estimatedDuration).toBe(195) // 3h 15m = 195 minutes
    })
  })

  describe('Instance Methods', () => {
    let flight

    beforeEach(async () => {
      flight = new Flight({
        flightNumber: 'UA456',
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
      })
      await flight.save()
    })

    describe('calculateDelay()', () => {
      it('should calculate delay based on actual departure time', () => {
        flight.schedule.departure.actual = new Date('2025-07-10T10:30:00Z')
        const delay = flight.calculateDelay()
        
        expect(delay).toBe(30)
        expect(flight.delay.minutes).toBe(30)
      })

      it('should calculate delay based on estimated departure time', () => {
        flight.schedule.departure.estimated = new Date('2025-07-10T10:45:00Z')
        const delay = flight.calculateDelay()
        
        expect(delay).toBe(45)
        expect(flight.delay.minutes).toBe(45)
      })

      it('should not calculate negative delays', () => {
        flight.schedule.departure.actual = new Date('2025-07-10T09:45:00Z') // 15 minutes early
        const delay = flight.calculateDelay()
        
        expect(delay).toBe(0)
        expect(flight.delay.minutes).toBe(0)
      })
    })

    describe('updateStatus()', () => {
      it('should update flight status and add history', async () => {
        await flight.updateStatus(FLIGHT_STATUSES.BOARDING, null, 'John Doe')
        
        expect(flight.status.current).toBe(FLIGHT_STATUSES.BOARDING)
        expect(flight.status.history).toHaveLength(1)
        expect(flight.status.history[0].status).toBe(FLIGHT_STATUSES.SCHEDULED)
        expect(flight.status.history[0].updatedBy).toBe('John Doe')
      })

      it('should set actual departure time when status is DEPARTED', async () => {
        await flight.updateStatus(FLIGHT_STATUSES.DEPARTED)
        
        expect(flight.schedule.departure.actual).toBeDefined()
        expect(flight.schedule.departure.actual).toBeInstanceOf(Date)
      })

      it('should set actual arrival time when status is ARRIVED', async () => {
        await flight.updateStatus(FLIGHT_STATUSES.ARRIVED)
        
        expect(flight.schedule.arrival.actual).toBeDefined()
        expect(flight.schedule.arrival.actual).toBeInstanceOf(Date)
      })

      it('should reject invalid status', async () => {
        await expect(flight.updateStatus('INVALID_STATUS')).rejects.toThrow(/Invalid status/)
      })
    })

    describe('updateGate()', () => {
      it('should update departure gate information', async () => {
        await flight.updateGate('3', 'C12', 'departure')
        
        expect(flight.route.origin.terminal).toBe('3')
        expect(flight.route.origin.gate).toBe('C12')
      })

      it('should update arrival gate information', async () => {
        await flight.updateGate('2', 'B8', 'arrival')
        
        expect(flight.route.destination.terminal).toBe('2')
        expect(flight.route.destination.gate).toBe('B8')
      })
    })

    describe('addDelay()', () => {
      it('should add delay and update estimated times', async () => {
        const originalDeparture = new Date(flight.schedule.departure.scheduled)
        const originalArrival = new Date(flight.schedule.arrival.scheduled)
        
        await flight.addDelay(45, DELAY_REASONS.WEATHER, 'Severe thunderstorms')
        
        expect(flight.delay.minutes).toBe(45)
        expect(flight.delay.reason).toBe(DELAY_REASONS.WEATHER)
        expect(flight.delay.description).toBe('Severe thunderstorms')
        
        expect(flight.schedule.departure.estimated.getTime()).toBe(originalDeparture.getTime() + (45 * 60000))
        expect(flight.schedule.arrival.estimated.getTime()).toBe(originalArrival.getTime() + (45 * 60000))
      })
    })
  })

  describe('Static Methods', () => {
    beforeEach(async () => {
      const flights = [
        {
          flightNumber: 'AA100',
          airline: { code: 'AA', name: 'American Airlines' },
          aircraft: { type: 'Boeing 777' },
          route: {
            origin: { airport: 'JFK', city: 'New York', country: 'US' },
            destination: { airport: 'LAX', city: 'Los Angeles', country: 'US' }
          },
          schedule: {
            departure: { scheduled: new Date('2025-07-10T08:00:00Z') },
            arrival: { scheduled: new Date('2025-07-10T11:00:00Z') }
          }
        },
        {
          flightNumber: 'UA200',
          airline: { code: 'UA', name: 'United Airlines' },
          aircraft: { type: 'Airbus A320' },
          route: {
            origin: { airport: 'ORD', city: 'Chicago', country: 'US' },
            destination: { airport: 'DEN', city: 'Denver', country: 'US' }
          },
          schedule: {
            departure: { scheduled: new Date('2025-07-10T14:00:00Z') },
            arrival: { scheduled: new Date('2025-07-10T16:00:00Z') }
          },
          delay: { minutes: 30, reason: DELAY_REASONS.TECHNICAL }
        },
        {
          flightNumber: 'DL300',
          airline: { code: 'DL', name: 'Delta Airlines' },
          aircraft: { type: 'Boeing 737' },
          route: {
            origin: { airport: 'JFK', city: 'New York', country: 'US' },
            destination: { airport: 'LAX', city: 'Los Angeles', country: 'US' }
          },
          schedule: {
            departure: { scheduled: new Date('2025-07-11T10:00:00Z') },
            arrival: { scheduled: new Date('2025-07-11T13:00:00Z') }
          },
          status: { current: FLIGHT_STATUSES.CANCELLED }
        }
      ]

      await Flight.insertMany(flights)
    })

    describe('findByRoute()', () => {
      it('should find flights by route', async () => {
        const flights = await Flight.findByRoute('JFK', 'LAX')
        
        expect(flights).toHaveLength(2)
        expect(flights[0].flightNumber).toBe('AA100')
        expect(flights[1].flightNumber).toBe('DL300')
      })

      it('should find flights by route and date', async () => {
        const flights = await Flight.findByRoute('JFK', 'LAX', new Date('2025-07-10'))
        
        expect(flights).toHaveLength(1)
        expect(flights[0].flightNumber).toBe('AA100')
      })
    })

    describe('findUpcoming()', () => {
      it('should find upcoming flights', async () => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2025-07-10T06:00:00Z'))
        
        const flights = await Flight.findUpcoming(24)
        
        expect(flights).toHaveLength(2) // AA100 and UA200, but not DL300 (cancelled)
        
        jest.useRealTimers()
      })
    })

    describe('findDelayed()', () => {
      it('should find delayed flights', async () => {
        const flights = await Flight.findDelayed(15)
        
        expect(flights).toHaveLength(1)
        expect(flights[0].flightNumber).toBe('UA200')
        expect(flights[0].delay.minutes).toBe(30)
      })
    })

    describe('findByAirline()', () => {
      it('should find flights by airline code', async () => {
        const flights = await Flight.findByAirline('AA')
        
        expect(flights).toHaveLength(1)
        expect(flights[0].flightNumber).toBe('AA100')
      })
    })

    describe('findByStatus()', () => {
      it('should find flights by status', async () => {
        const flights = await Flight.findByStatus(FLIGHT_STATUSES.CANCELLED)
        
        expect(flights).toHaveLength(1)
        expect(flights[0].flightNumber).toBe('DL300')
      })
    })
  })

  describe('Indexes', () => {
    it('should have proper indexes for performance', async () => {
      const indexes = await Flight.collection.getIndexes()
      
      expect(indexes).toHaveProperty('flightNumber_1')
      expect(indexes).toHaveProperty('airline.code_1')
      expect(indexes).toHaveProperty('route.origin.airport_1_route.destination.airport_1')
      expect(indexes).toHaveProperty('schedule.departure.scheduled_1')
      expect(indexes).toHaveProperty('status.current_1')
    })
  })
})