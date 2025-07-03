/**
 * FlightService Usage Examples
 * 
 * This file demonstrates how to use the FlightService for common aviation operations.
 * This is for documentation purposes and shows real-world usage patterns.
 */

const FlightService = require('../src/services/FlightService')
const NotificationService = require('../src/services/NotificationService')
const { FLIGHT_STATUSES, DELAY_REASONS } = require('../src/models/Flight')

// Example usage (Note: This requires a MongoDB connection)
async function demonstrateFlightService() {
  // Initialize services
  const logger = console // In production, use Winston or similar
  const notificationService = new NotificationService(logger)
  const flightService = new FlightService(logger, notificationService)

  try {
    console.log('=== FlightService Demonstration ===\n')

    // 1. Create a new flight
    console.log('1. Creating a new flight...')
    const newFlightData = {
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
          scheduled: new Date('2025-07-10T08:00:00Z')
        },
        arrival: {
          scheduled: new Date('2025-07-10T11:00:00Z')
        }
      }
    }

    const createdFlight = await flightService.createFlight(newFlightData, 'FlightOps')
    console.log('✓ Flight created:', createdFlight.flightNumber)
    console.log('  Route:', createdFlight.route.routeString)
    console.log('  Duration:', createdFlight.schedule.duration, 'minutes\n')

    // 2. Retrieve flight by number
    console.log('2. Retrieving flight by number...')
    const retrievedFlight = await flightService.getFlightByNumber('AA123')
    console.log('✓ Flight retrieved:', retrievedFlight.flightNumber)
    console.log('  Status:', retrievedFlight.status.current)
    console.log('  Airline:', retrievedFlight.airline.name, '\n')

    // 3. Update flight status
    console.log('3. Updating flight status to BOARDING...')
    const updatedFlight = await flightService.updateFlightStatus('AA123', {
      status: FLIGHT_STATUSES.BOARDING,
      reason: 'Flight ready for boarding',
      gate: {
        departure: {
          gate: 'A5',
          terminal: '1'
        }
      }
    }, 'GateAgent')
    console.log('✓ Status updated to:', updatedFlight.status.current)
    console.log('  New gate:', updatedFlight.route.origin.gate, '\n')

    // 4. Add flight delay
    console.log('4. Adding flight delay...')
    const delayedFlight = await flightService.updateFlightStatus('AA123', {
      delay: {
        minutes: 30,
        reason: DELAY_REASONS.WEATHER,
        description: 'Severe thunderstorms in departure area'
      }
    }, 'FlightDispatch')
    console.log('✓ Delay added:', delayedFlight.delay.minutes, 'minutes')
    console.log('  Reason:', delayedFlight.delay.reason)
    console.log('  Description:', delayedFlight.delay.description, '\n')

    // 5. Search flights
    console.log('5. Searching flights...')
    const searchResults = await flightService.searchFlights({
      searchText: 'American',
      airlines: ['AA'],
      limit: 10
    })
    console.log('✓ Search completed, found', searchResults.count, 'flights')
    searchResults.flights.forEach(flight => {
      console.log(`  - ${flight.flightNumber}: ${flight.route.routeString} (${flight.status.current})`)
    })
    console.log()

    // 6. Get flights with filters and pagination
    console.log('6. Getting flights with filters...')
    const filteredFlights = await flightService.getFlights(
      { airline: 'AA', status: [FLIGHT_STATUSES.BOARDING, FLIGHT_STATUSES.SCHEDULED] },
      { page: 1, limit: 5, sortBy: 'schedule.departure.scheduled' }
    )
    console.log('✓ Filtered flights retrieved:', filteredFlights.flights.length)
    console.log('  Total count:', filteredFlights.pagination.totalCount)
    console.log('  Current page:', filteredFlights.pagination.page, 'of', filteredFlights.pagination.totalPages)
    console.log()

    // 7. Get upcoming flights
    console.log('7. Getting upcoming flights (next 24 hours)...')
    const upcomingFlights = await flightService.getUpcomingFlights(24)
    console.log('✓ Found', upcomingFlights.count, 'upcoming flights')
    upcomingFlights.flights.forEach(flight => {
      const departureTime = new Date(flight.schedule.departure.scheduled).toLocaleString()
      console.log(`  - ${flight.flightNumber}: ${flight.route.routeString} at ${departureTime}`)
    })
    console.log()

    // 8. Calculate delay
    console.log('8. Demonstrating delay calculation...')
    const delayInfo = flightService.calculateDelay(
      '2025-07-10T08:00:00Z', // Scheduled
      '2025-07-10T08:30:00Z'  // Actual
    )
    console.log('✓ Delay calculated:')
    console.log('  Delay minutes:', delayInfo.delayMinutes)
    console.log('  Is delayed:', delayInfo.isDelayed)
    console.log('  Calculated at:', delayInfo.calculatedAt)
    console.log()

    // 9. Get flight history
    console.log('9. Getting flight history...')
    const flightHistory = await flightService.getFlightHistory('AA123')
    console.log('✓ Flight history retrieved:', flightHistory.totalEntries, 'entries')
    flightHistory.history.forEach(entry => {
      const date = new Date(entry.date).toLocaleDateString()
      console.log(`  - ${entry.flightNumber} on ${date}: ${entry.status} (${entry.route})`)
    })
    console.log()

    // 10. Validation examples
    console.log('10. Demonstrating validation methods...')
    console.log('✓ Validation examples:')
    console.log('  JFK is valid airport code:', flightService.isValidIATACode('JFK', 'airport'))
    console.log('  AA is valid airline code:', flightService.isValidIATACode('AA', 'airline'))
    console.log('  AA123 is valid flight number:', flightService.isValidFlightNumber('AA123'))
    console.log('  INVALID is valid flight number:', flightService.isValidFlightNumber('INVALID'))
    console.log()

    // 11. Service health check
    console.log('11. Checking service health...')
    const healthStatus = await flightService.getServiceHealth()
    console.log('✓ Service health:', healthStatus.status)
    console.log('  Database:', healthStatus.checks.database.status)
    console.log('  Validation:', healthStatus.checks.validation.status)
    console.log()

    console.log('=== FlightService Demonstration Complete ===')

  } catch (error) {
    console.error('❌ Error during demonstration:', error.message)
    if (error.details) {
      console.error('   Details:', error.details)
    }
  }
}

// Export example functions for use in other contexts
module.exports = {
  demonstrateFlightService,
  
  // Example utility functions
  createSampleFlight: async (flightService, flightNumber = 'AA123') => {
    const sampleData = {
      flightNumber,
      airline: { code: 'AA', name: 'American Airlines' },
      aircraft: { type: 'Boeing 737-800' },
      route: {
        origin: { airport: 'JFK', city: 'New York', country: 'US' },
        destination: { airport: 'LAX', city: 'Los Angeles', country: 'US' }
      },
      schedule: {
        departure: { scheduled: new Date(Date.now() + 2 * 60 * 60 * 1000) }, // 2 hours from now
        arrival: { scheduled: new Date(Date.now() + 5 * 60 * 60 * 1000) }     // 5 hours from now
      }
    }
    return await flightService.createFlight(sampleData)
  },

  processFlightStatusUpdate: async (flightService, flightNumber, newStatus) => {
    try {
      const result = await flightService.updateFlightStatus(flightNumber, {
        status: newStatus,
        reason: `Status updated to ${newStatus}`
      })
      console.log(`✓ Flight ${flightNumber} status updated to ${newStatus}`)
      return result
    } catch (error) {
      console.error(`❌ Failed to update ${flightNumber} status:`, error.message)
      throw error
    }
  },

  searchFlightsByRoute: async (flightService, origin, destination) => {
    const results = await flightService.searchFlights({
      route: { from: origin, to: destination },
      limit: 20
    })
    console.log(`✓ Found ${results.count} flights from ${origin} to ${destination}`)
    return results.flights
  }
}

// If running this file directly (for testing)
if (require.main === module) {
  console.log('This is an example file. To run the demonstration:')
  console.log('1. Ensure MongoDB is running')
  console.log('2. Connect to your database')
  console.log('3. Call demonstrateFlightService() function')
  console.log('4. Or import the utility functions for your own use')
}