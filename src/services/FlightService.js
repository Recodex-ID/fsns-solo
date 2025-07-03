const Flight = require('../models/Flight')
const { FLIGHT_STATUSES, DELAY_REASONS } = require('../models/Flight')
const {
  FlightError,
  FlightNotFoundError,
  FlightValidationError,
  FlightConflictError,
  FlightOperationError,
  FlightStatusError,
  FlightScheduleError,
  FlightDatabaseError
} = require('../errors/FlightErrors')

class FlightService {
  constructor(logger = null, notificationService = null) {
    this.logger = logger || console
    this.notificationService = notificationService
    this.initializeValidationRules()
  }

  initializeValidationRules() {
    this.validationRules = {
      iataAirportCode: /^[A-Z]{3}$/,
      iataFlightNumber: /^[A-Z]{2}[0-9]{1,4}[A-Z]?$/,
      iataAirlineCode: /^[A-Z0-9]{2,3}$/,
      aircraftRegistration: /^[A-Z]{1,2}-[A-Z0-9]{3,5}$/,
      pnr: /^[A-Z0-9]{6}$/
    }

    this.statusTransitions = {
      [FLIGHT_STATUSES.SCHEDULED]: [FLIGHT_STATUSES.DELAYED, FLIGHT_STATUSES.BOARDING, FLIGHT_STATUSES.CANCELLED],
      [FLIGHT_STATUSES.DELAYED]: [FLIGHT_STATUSES.BOARDING, FLIGHT_STATUSES.CANCELLED],
      [FLIGHT_STATUSES.BOARDING]: [FLIGHT_STATUSES.DEPARTED, FLIGHT_STATUSES.CANCELLED],
      [FLIGHT_STATUSES.DEPARTED]: [FLIGHT_STATUSES.IN_AIR, FLIGHT_STATUSES.DIVERTED],
      [FLIGHT_STATUSES.IN_AIR]: [FLIGHT_STATUSES.ARRIVED, FLIGHT_STATUSES.DIVERTED],
      [FLIGHT_STATUSES.ARRIVED]: [],
      [FLIGHT_STATUSES.CANCELLED]: [],
      [FLIGHT_STATUSES.DIVERTED]: [FLIGHT_STATUSES.ARRIVED]
    }
  }

  // ===========================================
  // VALIDATION METHODS
  // ===========================================

  isValidIATACode(code, type = 'airport') {
    if (!code || typeof code !== 'string') return false
    
    const patterns = {
      airport: this.validationRules.iataAirportCode,
      airline: this.validationRules.iataAirlineCode,
      flight: this.validationRules.iataFlightNumber
    }
    
    return patterns[type] ? patterns[type].test(code.toUpperCase()) : false
  }

  isValidFlightNumber(flightNumber) {
    return this.isValidIATACode(flightNumber, 'flight')
  }

  validateFlightData(data) {
    const errors = []

    // Required fields validation
    if (!data.flightNumber) {
      errors.push({ field: 'flightNumber', message: 'Flight number is required' })
    } else if (!this.isValidFlightNumber(data.flightNumber)) {
      errors.push({ 
        field: 'flightNumber', 
        message: 'Flight number must follow IATA format (e.g., AA123, UA1234A)',
        value: data.flightNumber
      })
    }

    // Airline validation
    if (!data.airline) {
      errors.push({ field: 'airline', message: 'Airline information is required' })
    } else {
      if (!data.airline.code) {
        errors.push({ field: 'airline.code', message: 'Airline code is required' })
      } else if (!this.isValidIATACode(data.airline.code, 'airline')) {
        errors.push({ 
          field: 'airline.code', 
          message: 'Airline code must be valid IATA format (e.g., AA, UA, QF)',
          value: data.airline.code
        })
      }

      if (!data.airline.name) {
        errors.push({ field: 'airline.name', message: 'Airline name is required' })
      }
    }

    // Route validation
    if (!data.route) {
      errors.push({ field: 'route', message: 'Route information is required' })
    } else {
      this.validateRoute(data.route, errors)
    }

    // Schedule validation
    if (!data.schedule) {
      errors.push({ field: 'schedule', message: 'Schedule information is required' })
    } else {
      this.validateSchedule(data.schedule, errors)
    }

    // Aircraft validation
    if (!data.aircraft) {
      errors.push({ field: 'aircraft', message: 'Aircraft information is required' })
    } else if (!data.aircraft.type) {
      errors.push({ field: 'aircraft.type', message: 'Aircraft type is required' })
    }

    if (errors.length > 0) {
      throw new FlightValidationError('Flight data validation failed', null, null, { errors })
    }

    return true
  }

  validateRoute(route, errors) {
    // Origin validation
    if (!route.origin) {
      errors.push({ field: 'route.origin', message: 'Origin information is required' })
    } else {
      if (!route.origin.airport) {
        errors.push({ field: 'route.origin.airport', message: 'Origin airport code is required' })
      } else if (!this.isValidIATACode(route.origin.airport, 'airport')) {
        errors.push({ 
          field: 'route.origin.airport', 
          message: 'Origin airport code must be valid IATA format (e.g., JFK, LAX)',
          value: route.origin.airport
        })
      }

      if (!route.origin.city) {
        errors.push({ field: 'route.origin.city', message: 'Origin city is required' })
      }

      if (!route.origin.country) {
        errors.push({ field: 'route.origin.country', message: 'Origin country is required' })
      }
    }

    // Destination validation
    if (!route.destination) {
      errors.push({ field: 'route.destination', message: 'Destination information is required' })
    } else {
      if (!route.destination.airport) {
        errors.push({ field: 'route.destination.airport', message: 'Destination airport code is required' })
      } else if (!this.isValidIATACode(route.destination.airport, 'airport')) {
        errors.push({ 
          field: 'route.destination.airport', 
          message: 'Destination airport code must be valid IATA format (e.g., JFK, LAX)',
          value: route.destination.airport
        })
      }

      if (!route.destination.city) {
        errors.push({ field: 'route.destination.city', message: 'Destination city is required' })
      }

      if (!route.destination.country) {
        errors.push({ field: 'route.destination.country', message: 'Destination country is required' })
      }
    }

    // Same origin/destination validation
    if (route.origin && route.destination && 
        route.origin.airport && route.destination.airport &&
        route.origin.airport.toUpperCase() === route.destination.airport.toUpperCase()) {
      errors.push({ 
        field: 'route', 
        message: 'Origin and destination airports cannot be the same',
        value: { origin: route.origin.airport, destination: route.destination.airport }
      })
    }
  }

  validateSchedule(schedule, errors) {
    if (!schedule.departure) {
      errors.push({ field: 'schedule.departure', message: 'Departure schedule is required' })
    } else if (!schedule.departure.scheduled) {
      errors.push({ field: 'schedule.departure.scheduled', message: 'Scheduled departure time is required' })
    }

    if (!schedule.arrival) {
      errors.push({ field: 'schedule.arrival', message: 'Arrival schedule is required' })
    } else if (!schedule.arrival.scheduled) {
      errors.push({ field: 'schedule.arrival.scheduled', message: 'Scheduled arrival time is required' })
    }

    // Departure before arrival validation
    if (schedule.departure?.scheduled && schedule.arrival?.scheduled) {
      const depTime = new Date(schedule.departure.scheduled)
      const arrTime = new Date(schedule.arrival.scheduled)
      
      if (depTime >= arrTime) {
        errors.push({ 
          field: 'schedule', 
          message: 'Departure time must be before arrival time',
          value: { departure: depTime.toISOString(), arrival: arrTime.toISOString() }
        })
      }
    }
  }

  validateStatusTransition(currentStatus, newStatus) {
    const allowedTransitions = this.statusTransitions[currentStatus] || []
    return allowedTransitions.includes(newStatus)
  }

  // ===========================================
  // CRUD OPERATIONS
  // ===========================================

  async createFlight(flightData, createdBy = 'System') {
    try {
      this.logger.info('Creating new flight', { flightNumber: flightData.flightNumber, createdBy })

      // Validate flight data
      this.validateFlightData(flightData)

      // Check for existing flight with same number
      const existingFlight = await Flight.findOne({ 
        flightNumber: flightData.flightNumber.toUpperCase(),
        isActive: true 
      })

      if (existingFlight) {
        throw new FlightConflictError(
          `Flight ${flightData.flightNumber} already exists`,
          'DUPLICATE_FLIGHT_NUMBER',
          { existingFlightId: existingFlight._id }
        )
      }

      // Create flight
      const flight = new Flight({
        ...flightData,
        flightNumber: flightData.flightNumber.toUpperCase(),
        createdBy,
        lastUpdated: new Date()
      })

      const savedFlight = await flight.save()
      
      this.logger.info('Flight created successfully', { 
        flightId: savedFlight._id,
        flightNumber: savedFlight.flightNumber,
        createdBy
      })

      return this.formatFlightData(savedFlight)

    } catch (error) {
      this.logger.error('Error creating flight', { 
        error: error.message, 
        flightNumber: flightData.flightNumber,
        stack: error.stack
      })

      if (error instanceof FlightError) {
        throw error
      }

      if (error.code === 11000) { // MongoDB duplicate key error
        throw new FlightConflictError(
          `Flight ${flightData.flightNumber} already exists`,
          'DUPLICATE_FLIGHT_NUMBER'
        )
      }

      throw new FlightDatabaseError(
        'Failed to create flight due to database error',
        'CREATE_FLIGHT',
        { originalError: error.message }
      )
    }
  }

  async getFlightByNumber(flightNumber, includeHistory = false) {
    try {
      this.logger.info('Fetching flight by number', { flightNumber })

      if (!flightNumber) {
        throw new FlightValidationError('Flight number is required')
      }

      if (!this.isValidFlightNumber(flightNumber)) {
        throw new FlightValidationError(
          'Invalid flight number format',
          'flightNumber',
          flightNumber
        )
      }

      let query = Flight.findOne({ 
        flightNumber: flightNumber.toUpperCase(),
        isActive: true 
      })

      if (includeHistory) {
        query = query.populate('passengers crew')
      }

      const flight = await query.exec()

      if (!flight) {
        throw new FlightNotFoundError(
          flightNumber,
          { searchedFlightNumber: flightNumber.toUpperCase() }
        )
      }

      this.logger.info('Flight retrieved successfully', { 
        flightId: flight._id,
        flightNumber: flight.flightNumber
      })

      return this.formatFlightData(flight)

    } catch (error) {
      this.logger.error('Error fetching flight by number', { 
        error: error.message, 
        flightNumber,
        stack: error.stack
      })

      if (error instanceof FlightError) {
        throw error
      }

      throw new FlightDatabaseError(
        'Failed to fetch flight due to database error',
        'GET_FLIGHT_BY_NUMBER',
        { originalError: error.message, flightNumber }
      )
    }
  }

  async getFlights(filters = {}, options = {}) {
    try {
      this.logger.info('Fetching flights with filters', { filters, options })

      const {
        page = 1,
        limit = 20,
        sortBy = 'schedule.departure.scheduled',
        sortOrder = 'asc',
        includeInactive = false
      } = options

      // Build query
      const query = this.buildFlightQuery(filters, includeInactive)

      // Calculate pagination
      const skip = (page - 1) * limit
      const sortDirection = sortOrder === 'desc' ? -1 : 1

      // Execute query with pagination
      const [flights, totalCount] = await Promise.all([
        Flight.find(query)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(limit)
          .lean(),
        Flight.countDocuments(query)
      ])

      const formattedFlights = flights.map(flight => this.formatFlightData(flight))

      const result = {
        flights: formattedFlights,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNextPage: page < Math.ceil(totalCount / limit),
          hasPrevPage: page > 1
        },
        appliedFilters: filters
      }

      this.logger.info('Flights retrieved successfully', { 
        count: flights.length,
        totalCount,
        page,
        filters
      })

      return result

    } catch (error) {
      this.logger.error('Error fetching flights', { 
        error: error.message, 
        filters,
        options,
        stack: error.stack
      })

      if (error instanceof FlightError) {
        throw error
      }

      throw new FlightDatabaseError(
        'Failed to fetch flights due to database error',
        'GET_FLIGHTS',
        { originalError: error.message, filters }
      )
    }
  }

  buildFlightQuery(filters, includeInactive = false) {
    const query = {}

    if (!includeInactive) {
      query.isActive = true
    }

    // Flight number filter
    if (filters.flightNumber) {
      query.flightNumber = new RegExp(filters.flightNumber.toUpperCase(), 'i')
    }

    // Airline filter
    if (filters.airline) {
      query['airline.code'] = filters.airline.toUpperCase()
    }

    // Route filters
    if (filters.origin) {
      query['route.origin.airport'] = filters.origin.toUpperCase()
    }

    if (filters.destination) {
      query['route.destination.airport'] = filters.destination.toUpperCase()
    }

    // Status filter
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query['status.current'] = { $in: filters.status }
      } else {
        query['status.current'] = filters.status
      }
    }

    // Date range filters
    if (filters.departureDate) {
      const date = new Date(filters.departureDate)
      const startOfDay = new Date(date.setHours(0, 0, 0, 0))
      const endOfDay = new Date(date.setHours(23, 59, 59, 999))
      
      query['schedule.departure.scheduled'] = {
        $gte: startOfDay,
        $lte: endOfDay
      }
    }

    if (filters.departureDateRange) {
      const dateQuery = {}
      if (filters.departureDateRange.start) {
        dateQuery.$gte = new Date(filters.departureDateRange.start)
      }
      if (filters.departureDateRange.end) {
        dateQuery.$lte = new Date(filters.departureDateRange.end)
      }
      query['schedule.departure.scheduled'] = dateQuery
    }

    // Delay filter
    if (filters.minDelay) {
      query['delay.minutes'] = { $gte: parseInt(filters.minDelay) }
    }

    // International/domestic filter
    if (filters.flightType === 'international') {
      query.$expr = { $ne: ['$route.origin.country', '$route.destination.country'] }
    } else if (filters.flightType === 'domestic') {
      query.$expr = { $eq: ['$route.origin.country', '$route.destination.country'] }
    }

    return query
  }

  async updateFlightStatus(flightNumber, updateData, updatedBy = 'System') {
    try {
      this.logger.info('Updating flight status', { 
        flightNumber, 
        updateData, 
        updatedBy 
      })

      // Get current flight
      const flight = await Flight.findOne({ 
        flightNumber: flightNumber.toUpperCase(),
        isActive: true 
      })

      if (!flight) {
        throw new FlightNotFoundError(flightNumber)
      }

      const oldStatus = flight.status.current
      const newStatus = updateData.status

      // Validate status transition if status is being updated
      if (newStatus && newStatus !== oldStatus) {
        if (!this.validateStatusTransition(oldStatus, newStatus)) {
          throw new FlightStatusError(
            `Invalid status transition from ${oldStatus} to ${newStatus}`,
            oldStatus,
            newStatus,
            { allowedTransitions: this.statusTransitions[oldStatus] }
          )
        }
      }

      // Update flight using the model's updateStatus method if status is changing
      if (newStatus && newStatus !== oldStatus) {
        await flight.updateStatus(
          newStatus, 
          updateData.reason, 
          updatedBy, 
          updateData.metadata || {}
        )
      }

      // Handle other updates
      const updateFields = {}

      // Update schedule times
      if (updateData.schedule) {
        if (updateData.schedule.departure) {
          Object.keys(updateData.schedule.departure).forEach(key => {
            updateFields[`schedule.departure.${key}`] = updateData.schedule.departure[key]
          })
        }
        if (updateData.schedule.arrival) {
          Object.keys(updateData.schedule.arrival).forEach(key => {
            updateFields[`schedule.arrival.${key}`] = updateData.schedule.arrival[key]
          })
        }
      }

      // Update gate information
      if (updateData.gate) {
        if (updateData.gate.departure) {
          updateFields['route.origin.gate'] = updateData.gate.departure.gate
          updateFields['route.origin.terminal'] = updateData.gate.departure.terminal
        }
        if (updateData.gate.arrival) {
          updateFields['route.destination.gate'] = updateData.gate.arrival.gate
          updateFields['route.destination.terminal'] = updateData.gate.arrival.terminal
        }
      }

      // Update delay information
      if (updateData.delay) {
        if (updateData.delay.minutes !== undefined) {
          updateFields['delay.minutes'] = updateData.delay.minutes
        }
        if (updateData.delay.reason) {
          updateFields['delay.reason'] = updateData.delay.reason
        }
        if (updateData.delay.description) {
          updateFields['delay.description'] = updateData.delay.description
        }
      }

      // Apply additional updates if any
      if (Object.keys(updateFields).length > 0) {
        updateFields.lastUpdated = new Date()
        await Flight.findByIdAndUpdate(flight._id, updateFields)
      }

      // Reload flight with updates
      const updatedFlight = await Flight.findById(flight._id)

      // Trigger notifications if status changed
      if (newStatus && newStatus !== oldStatus && this.notificationService) {
        try {
          await this.notificationService.notifyFlightStatusChange(
            updatedFlight,
            oldStatus,
            newStatus,
            updatedBy
          )
        } catch (notificationError) {
          this.logger.warn('Failed to send flight status notification', {
            flightNumber: updatedFlight.flightNumber,
            error: notificationError.message
          })
        }
      }

      this.logger.info('Flight status updated successfully', { 
        flightId: updatedFlight._id,
        flightNumber: updatedFlight.flightNumber,
        oldStatus,
        newStatus: updatedFlight.status.current,
        updatedBy
      })

      return this.formatFlightData(updatedFlight)

    } catch (error) {
      this.logger.error('Error updating flight status', { 
        error: error.message, 
        flightNumber,
        updateData,
        stack: error.stack
      })

      if (error instanceof FlightError) {
        throw error
      }

      throw new FlightDatabaseError(
        'Failed to update flight status due to database error',
        'UPDATE_FLIGHT_STATUS',
        { originalError: error.message, flightNumber, updateData }
      )
    }
  }

  async getUpcomingFlights(hoursAhead = 24, filters = {}) {
    try {
      this.logger.info('Fetching upcoming flights', { hoursAhead, filters })

      const flights = await Flight.findUpcoming(hoursAhead)

      // Apply additional filters if provided
      let filteredFlights = flights
      if (Object.keys(filters).length > 0) {
        filteredFlights = flights.filter(flight => {
          return this.matchesFilters(flight, filters)
        })
      }

      const formattedFlights = filteredFlights.map(flight => this.formatFlightData(flight))

      this.logger.info('Upcoming flights retrieved successfully', { 
        count: formattedFlights.length,
        hoursAhead,
        filters
      })

      return {
        flights: formattedFlights,
        hoursAhead,
        appliedFilters: filters,
        count: formattedFlights.length
      }

    } catch (error) {
      this.logger.error('Error fetching upcoming flights', { 
        error: error.message, 
        hoursAhead,
        filters,
        stack: error.stack
      })

      throw new FlightDatabaseError(
        'Failed to fetch upcoming flights due to database error',
        'GET_UPCOMING_FLIGHTS',
        { originalError: error.message, hoursAhead, filters }
      )
    }
  }

  async searchFlights(criteria) {
    try {
      this.logger.info('Searching flights with criteria', { criteria })

      const query = {}

      // Text search across multiple fields
      if (criteria.searchText) {
        const searchRegex = new RegExp(criteria.searchText, 'i')
        query.$or = [
          { flightNumber: searchRegex },
          { 'airline.name': searchRegex },
          { 'airline.code': searchRegex },
          { 'route.origin.airport': searchRegex },
          { 'route.origin.city': searchRegex },
          { 'route.destination.airport': searchRegex },
          { 'route.destination.city': searchRegex },
          { 'aircraft.type': searchRegex }
        ]
      }

      // Route-based search
      if (criteria.route) {
        if (criteria.route.from) {
          query['route.origin.airport'] = criteria.route.from.toUpperCase()
        }
        if (criteria.route.to) {
          query['route.destination.airport'] = criteria.route.to.toUpperCase()
        }
      }

      // Time-based search
      if (criteria.timeRange) {
        const timeQuery = {}
        if (criteria.timeRange.start) {
          timeQuery.$gte = new Date(criteria.timeRange.start)
        }
        if (criteria.timeRange.end) {
          timeQuery.$lte = new Date(criteria.timeRange.end)
        }
        query['schedule.departure.scheduled'] = timeQuery
      }

      // Status-based search
      if (criteria.statuses && criteria.statuses.length > 0) {
        query['status.current'] = { $in: criteria.statuses }
      }

      // Airline search
      if (criteria.airlines && criteria.airlines.length > 0) {
        query['airline.code'] = { $in: criteria.airlines.map(code => code.toUpperCase()) }
      }

      // Aircraft type search
      if (criteria.aircraftTypes && criteria.aircraftTypes.length > 0) {
        query['aircraft.type'] = { $in: criteria.aircraftTypes }
      }

      // Delay search
      if (criteria.delayMinutes) {
        if (criteria.delayMinutes.min !== undefined) {
          query['delay.minutes'] = { ...query['delay.minutes'], $gte: criteria.delayMinutes.min }
        }
        if (criteria.delayMinutes.max !== undefined) {
          query['delay.minutes'] = { ...query['delay.minutes'], $lte: criteria.delayMinutes.max }
        }
      }

      // International/domestic filter
      if (criteria.flightType === 'international') {
        query.$expr = { $ne: ['$route.origin.country', '$route.destination.country'] }
      } else if (criteria.flightType === 'domestic') {
        query.$expr = { $eq: ['$route.origin.country', '$route.destination.country'] }
      }

      // Only active flights unless specified
      if (!criteria.includeInactive) {
        query.isActive = true
      }

      // Execute search with optional sorting and limiting
      let searchQuery = Flight.find(query)

      if (criteria.sortBy) {
        const sortDirection = criteria.sortOrder === 'desc' ? -1 : 1
        searchQuery = searchQuery.sort({ [criteria.sortBy]: sortDirection })
      } else {
        searchQuery = searchQuery.sort({ 'schedule.departure.scheduled': 1 })
      }

      if (criteria.limit) {
        searchQuery = searchQuery.limit(criteria.limit)
      }

      const flights = await searchQuery.lean()
      const formattedFlights = flights.map(flight => this.formatFlightData(flight))

      this.logger.info('Flight search completed successfully', { 
        count: formattedFlights.length,
        criteria
      })

      return {
        flights: formattedFlights,
        searchCriteria: criteria,
        count: formattedFlights.length
      }

    } catch (error) {
      this.logger.error('Error searching flights', { 
        error: error.message, 
        criteria,
        stack: error.stack
      })

      throw new FlightDatabaseError(
        'Failed to search flights due to database error',
        'SEARCH_FLIGHTS',
        { originalError: error.message, criteria }
      )
    }
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  calculateDelay(scheduledTime, actualTime = null) {
    try {
      const scheduled = new Date(scheduledTime)
      const actual = actualTime ? new Date(actualTime) : new Date()

      if (isNaN(scheduled.getTime())) {
        throw new FlightValidationError(
          'Invalid scheduled time format',
          'scheduledTime',
          scheduledTime
        )
      }

      if (actualTime && isNaN(actual.getTime())) {
        throw new FlightValidationError(
          'Invalid actual time format',
          'actualTime',
          actualTime
        )
      }

      const delayMinutes = Math.floor((actual - scheduled) / (1000 * 60))

      return {
        delayMinutes: Math.max(0, delayMinutes),
        isDelayed: delayMinutes > 0,
        scheduledTime: scheduled.toISOString(),
        actualTime: actual.toISOString(),
        calculatedAt: new Date().toISOString()
      }

    } catch (error) {
      this.logger.error('Error calculating delay', { 
        error: error.message, 
        scheduledTime,
        actualTime
      })

      if (error instanceof FlightError) {
        throw error
      }

      throw new FlightOperationError(
        'Failed to calculate delay',
        'CALCULATE_DELAY',
        { originalError: error.message, scheduledTime, actualTime }
      )
    }
  }

  formatFlightData(flight) {
    if (!flight) return null

    const flightObj = flight.toObject ? flight.toObject() : flight

    return {
      id: flightObj._id,
      flightNumber: flightObj.flightNumber,
      airline: {
        code: flightObj.airline.code,
        name: flightObj.airline.name,
        icao: flightObj.airline.icao
      },
      aircraft: {
        type: flightObj.aircraft.type,
        registration: flightObj.aircraft.registration,
        manufacturer: flightObj.aircraft.manufacturer,
        model: flightObj.aircraft.model,
        capacity: flightObj.aircraft.capacity
      },
      route: {
        origin: {
          airport: flightObj.route.origin.airport,
          city: flightObj.route.origin.city,
          country: flightObj.route.origin.country,
          terminal: flightObj.route.origin.terminal,
          gate: flightObj.route.origin.gate
        },
        destination: {
          airport: flightObj.route.destination.airport,
          city: flightObj.route.destination.city,
          country: flightObj.route.destination.country,
          terminal: flightObj.route.destination.terminal,
          gate: flightObj.route.destination.gate
        },
        distance: flightObj.route.distance,
        routeString: `${flightObj.route.origin.airport}-${flightObj.route.destination.airport}`
      },
      schedule: {
        departure: {
          scheduled: flightObj.schedule.departure.scheduled,
          estimated: flightObj.schedule.departure.estimated,
          actual: flightObj.schedule.departure.actual
        },
        arrival: {
          scheduled: flightObj.schedule.arrival.scheduled,
          estimated: flightObj.schedule.arrival.estimated,
          actual: flightObj.schedule.arrival.actual
        },
        duration: flightObj.duration || this.calculateFlightDuration(
          flightObj.schedule.departure.scheduled,
          flightObj.schedule.arrival.scheduled
        )
      },
      status: {
        current: flightObj.status.current,
        history: flightObj.status.history || []
      },
      delay: {
        minutes: flightObj.delay.minutes || 0,
        reason: flightObj.delay.reason,
        description: flightObj.delay.description,
        isDelayed: (flightObj.delay.minutes || 0) > 0
      },
      operational: {
        priority: flightObj.operational?.priority || 5,
        isActive: flightObj.isActive,
        isInternational: flightObj.route.origin.country !== flightObj.route.destination.country
      },
      timestamps: {
        createdAt: flightObj.createdAt,
        updatedAt: flightObj.updatedAt,
        lastUpdated: flightObj.lastUpdated
      }
    }
  }

  calculateFlightDuration(departureTime, arrivalTime) {
    if (!departureTime || !arrivalTime) return null
    
    const departure = new Date(departureTime)
    const arrival = new Date(arrivalTime)
    
    return Math.floor((arrival - departure) / (1000 * 60)) // Duration in minutes
  }

  async getFlightHistory(flightNumber, options = {}) {
    try {
      this.logger.info('Fetching flight history', { flightNumber, options })

      const {
        includeStatusHistory = true,
        includeDelayHistory = true,
        limit = 50,
        sortOrder = 'desc'
      } = options

      if (!this.isValidFlightNumber(flightNumber)) {
        throw new FlightValidationError(
          'Invalid flight number format',
          'flightNumber',
          flightNumber
        )
      }

      const query = {
        flightNumber: flightNumber.toUpperCase()
      }

      // Include inactive flights for historical data
      let flights = await Flight.find(query)
        .sort({ createdAt: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit)
        .lean()

      const history = flights.map(flight => {
        const formattedFlight = this.formatFlightData(flight)
        
        const historyEntry = {
          flightId: formattedFlight.id,
          flightNumber: formattedFlight.flightNumber,
          date: flight.schedule.departure.scheduled,
          route: formattedFlight.route.routeString,
          status: formattedFlight.status.current,
          delay: formattedFlight.delay,
          createdAt: flight.createdAt,
          isActive: flight.isActive
        }

        if (includeStatusHistory && flight.status.history) {
          historyEntry.statusHistory = flight.status.history
        }

        return historyEntry
      })

      this.logger.info('Flight history retrieved successfully', { 
        flightNumber,
        historyCount: history.length
      })

      return {
        flightNumber: flightNumber.toUpperCase(),
        history,
        totalEntries: history.length,
        options
      }

    } catch (error) {
      this.logger.error('Error fetching flight history', { 
        error: error.message, 
        flightNumber,
        stack: error.stack
      })

      if (error instanceof FlightError) {
        throw error
      }

      throw new FlightDatabaseError(
        'Failed to fetch flight history due to database error',
        'GET_FLIGHT_HISTORY',
        { originalError: error.message, flightNumber }
      )
    }
  }

  matchesFilters(flight, filters) {
    if (filters.airline && flight.airline.code !== filters.airline.toUpperCase()) {
      return false
    }

    if (filters.status && flight.status.current !== filters.status) {
      return false
    }

    if (filters.minDelay && flight.delay.minutes < filters.minDelay) {
      return false
    }

    return true
  }

  // ===========================================
  // HEALTH AND MONITORING
  // ===========================================

  async getServiceHealth() {
    try {
      const healthCheck = {
        service: 'FlightService',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {}
      }

      // Database connectivity check
      try {
        await Flight.findOne({}).limit(1)
        healthCheck.checks.database = { status: 'healthy', message: 'Database connection OK' }
      } catch (dbError) {
        healthCheck.checks.database = { status: 'unhealthy', message: dbError.message }
        healthCheck.status = 'unhealthy'
      }

      // Validation rules check
      try {
        this.isValidFlightNumber('AA123')
        healthCheck.checks.validation = { status: 'healthy', message: 'Validation rules OK' }
      } catch (validationError) {
        healthCheck.checks.validation = { status: 'unhealthy', message: validationError.message }
        healthCheck.status = 'unhealthy'
      }

      return healthCheck

    } catch (error) {
      return {
        service: 'FlightService',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      }
    }
  }
}

module.exports = FlightService