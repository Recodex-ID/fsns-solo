const mongoose = require('mongoose')

const FLIGHT_STATUSES = {
  SCHEDULED: 'Scheduled',
  DELAYED: 'Delayed',
  BOARDING: 'Boarding',
  DEPARTED: 'Departed',
  IN_AIR: 'In-Air',
  ARRIVED: 'Arrived',
  CANCELLED: 'Cancelled',
  DIVERTED: 'Diverted'
}

const DELAY_REASONS = {
  WEATHER: 'Weather',
  TECHNICAL: 'Technical',
  CREW: 'Crew',
  ATC: 'Air Traffic Control',
  SECURITY: 'Security',
  PASSENGER: 'Passenger',
  AIRPORT: 'Airport Operations',
  AIRCRAFT: 'Aircraft Change',
  OTHER: 'Other'
}

const validateIATAFlightNumber = function (flightNumber) {
  const iataPattern = /^[A-Z]{2}[0-9]{1,4}[A-Z]?$/
  if (!iataPattern.test(flightNumber)) {
    throw new Error('Flight number must follow IATA format (e.g., AA123, UA1234A)')
  }
  return true
}

const validateIATAAirportCode = function (airportCode) {
  const iataPattern = /^[A-Z]{3}$/
  if (!iataPattern.test(airportCode)) {
    throw new Error('Airport code must be a valid 3-letter IATA code (e.g., JFK, LAX)')
  }
  return true
}

const validateAirlineCode = function (airlineCode) {
  const iataPattern = /^[A-Z0-9]{2,3}$/
  if (!iataPattern.test(airlineCode)) {
    throw new Error('Airline code must be a valid 2-3 character IATA code (e.g., AA, UA, QF)')
  }
  return true
}

const validateAircraftRegistration = function (registration) {
  if (!registration) return true
  const pattern = /^[A-Z]{1,2}-[A-Z0-9]{3,5}$/
  if (!pattern.test(registration)) {
    throw new Error('Aircraft registration must follow format XX-XXXXX (e.g., N123AB, PK-ABC)')
  }
  return true
}

const StatusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: Object.values(FLIGHT_STATUSES),
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  reason: {
    type: String,
    trim: true
  },
  updatedBy: {
    type: String,
    trim: true
  },
  metadata: {
    type: Map,
    of: String
  }
}, { _id: true })

const DelaySchema = new mongoose.Schema({
  minutes: {
    type: Number,
    min: [0, 'Delay minutes cannot be negative'],
    default: 0
  },
  reason: {
    type: String,
    enum: Object.values(DELAY_REASONS),
    default: DELAY_REASONS.OTHER
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Delay description cannot exceed 500 characters']
  },
  estimatedDuration: {
    type: Number,
    min: [0, 'Estimated delay duration cannot be negative']
  }
}, { _id: false })

const AircraftSchema = new mongoose.Schema({
  registration: {
    type: String,
    trim: true,
    uppercase: true,
    validate: [validateAircraftRegistration, 'Invalid aircraft registration format']
  },
  type: {
    type: String,
    trim: true,
    required: [true, 'Aircraft type is required']
  },
  manufacturer: {
    type: String,
    trim: true
  },
  model: {
    type: String,
    trim: true
  },
  capacity: {
    economy: {
      type: Number,
      min: [0, 'Economy capacity cannot be negative']
    },
    business: {
      type: Number,
      min: [0, 'Business capacity cannot be negative']
    },
    first: {
      type: Number,
      min: [0, 'First class capacity cannot be negative']
    },
    total: {
      type: Number,
      min: [1, 'Total capacity must be at least 1']
    }
  },
  configuration: {
    type: String,
    trim: true
  }
}, { _id: false })

const RouteSchema = new mongoose.Schema({
  origin: {
    airport: {
      type: String,
      required: [true, 'Origin airport code is required'],
      trim: true,
      uppercase: true,
      validate: [validateIATAAirportCode, 'Invalid IATA airport code format']
    },
    city: {
      type: String,
      required: [true, 'Origin city is required'],
      trim: true
    },
    country: {
      type: String,
      required: [true, 'Origin country is required'],
      trim: true
    },
    terminal: {
      type: String,
      trim: true
    },
    gate: {
      type: String,
      trim: true
    }
  },
  destination: {
    airport: {
      type: String,
      required: [true, 'Destination airport code is required'],
      trim: true,
      uppercase: true,
      validate: [validateIATAAirportCode, 'Invalid IATA airport code format']
    },
    city: {
      type: String,
      required: [true, 'Destination city is required'],
      trim: true
    },
    country: {
      type: String,
      required: [true, 'Destination country is required'],
      trim: true
    },
    terminal: {
      type: String,
      trim: true
    },
    gate: {
      type: String,
      trim: true
    }
  },
  distance: {
    type: Number,
    min: [0, 'Distance cannot be negative']
  },
  timezone: {
    origin: {
      type: String,
      trim: true
    },
    destination: {
      type: String,
      trim: true
    }
  }
}, { _id: false })

const ScheduleSchema = new mongoose.Schema({
  departure: {
    scheduled: {
      type: Date,
      required: [true, 'Scheduled departure time is required']
    },
    estimated: {
      type: Date
    },
    actual: {
      type: Date
    }
  },
  arrival: {
    scheduled: {
      type: Date,
      required: [true, 'Scheduled arrival time is required']
    },
    estimated: {
      type: Date
    },
    actual: {
      type: Date
    }
  }
}, { _id: false })

const FlightSchema = new mongoose.Schema({
  flightNumber: {
    type: String,
    required: [true, 'Flight number is required'],
    unique: true,
    trim: true,
    uppercase: true,
    validate: [validateIATAFlightNumber, 'Invalid IATA flight number format']
  },
  airline: {
    code: {
      type: String,
      required: [true, 'Airline code is required'],
      trim: true,
      uppercase: true,
      validate: [validateAirlineCode, 'Invalid airline code format']
    },
    name: {
      type: String,
      required: [true, 'Airline name is required'],
      trim: true
    },
    icao: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: function (icao) {
          if (!icao) return true
          return /^[A-Z]{3}$/.test(icao)
        },
        message: 'ICAO code must be 3 letters'
      }
    }
  },
  aircraft: {
    type: AircraftSchema,
    required: [true, 'Aircraft information is required']
  },
  route: {
    type: RouteSchema,
    required: [true, 'Route information is required']
  },
  schedule: {
    type: ScheduleSchema,
    required: [true, 'Schedule information is required']
  },
  status: {
    current: {
      type: String,
      enum: Object.values(FLIGHT_STATUSES),
      default: FLIGHT_STATUSES.SCHEDULED
    },
    history: [StatusHistorySchema]
  },
  delay: {
    type: DelaySchema,
    default: () => ({})
  },
  codeshare: {
    isPrimary: {
      type: Boolean,
      default: true
    },
    partners: [{
      airline: {
        type: String,
        trim: true,
        uppercase: true
      },
      flightNumber: {
        type: String,
        trim: true,
        uppercase: true
      }
    }]
  },
  passengers: [{
    type: mongoose.Schema.ObjectId,
    ref: 'Passenger'
  }],
  crew: [{
    type: mongoose.Schema.ObjectId,
    ref: 'CrewMember'
  }],
  baggage: {
    checkedIn: {
      type: Number,
      min: [0, 'Checked baggage count cannot be negative'],
      default: 0
    },
    loaded: {
      type: Number,
      min: [0, 'Loaded baggage count cannot be negative'],
      default: 0
    }
  },
  fuel: {
    planned: {
      type: Number,
      min: [0, 'Planned fuel cannot be negative']
    },
    actual: {
      type: Number,
      min: [0, 'Actual fuel cannot be negative']
    },
    unit: {
      type: String,
      enum: ['kg', 'lbs', 'gallons', 'liters'],
      default: 'kg'
    }
  },
  weather: {
    origin: {
      condition: String,
      visibility: Number,
      windSpeed: Number,
      windDirection: Number,
      temperature: Number
    },
    destination: {
      condition: String,
      visibility: Number,
      windSpeed: Number,
      windDirection: Number,
      temperature: Number
    },
    route: {
      turbulence: {
        type: String,
        enum: ['None', 'Light', 'Moderate', 'Severe']
      },
      headwind: Number,
      tailwind: Number
    }
  },
  operational: {
    priority: {
      type: Number,
      min: [1, 'Priority must be at least 1'],
      max: [10, 'Priority cannot exceed 10'],
      default: 5
    },
    slot: {
      departure: Date,
      arrival: Date
    },
    restrictions: [String],
    notes: {
      type: String,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

FlightSchema.virtual('duration').get(function () {
  if (this.schedule.departure.scheduled && this.schedule.arrival.scheduled) {
    return Math.floor((this.schedule.arrival.scheduled - this.schedule.departure.scheduled) / (1000 * 60))
  }
  return null
})

FlightSchema.virtual('estimatedDuration').get(function () {
  if (this.schedule.departure.estimated && this.schedule.arrival.estimated) {
    return Math.floor((this.schedule.arrival.estimated - this.schedule.departure.estimated) / (1000 * 60))
  }
  return this.duration
})

FlightSchema.virtual('actualDuration').get(function () {
  if (this.schedule.departure.actual && this.schedule.arrival.actual) {
    return Math.floor((this.schedule.arrival.actual - this.schedule.departure.actual) / (1000 * 60))
  }
  return null
})

FlightSchema.virtual('isDelayed').get(function () {
  return this.delay.minutes > 0
})

FlightSchema.virtual('isInternational').get(function () {
  return this.route.origin.country !== this.route.destination.country
})

FlightSchema.virtual('routeString').get(function () {
  return `${this.route.origin.airport}-${this.route.destination.airport}`
})

FlightSchema.virtual('fullFlightNumber').get(function () {
  return `${this.airline.code}${this.flightNumber.substring(2)}`
})

FlightSchema.methods.calculateDelay = function () {
  const currentTime = new Date()
  let delayMinutes = 0
  
  if (this.schedule.departure.actual && this.schedule.departure.scheduled) {
    delayMinutes = Math.floor((this.schedule.departure.actual - this.schedule.departure.scheduled) / (1000 * 60))
  } else if (this.schedule.departure.estimated && this.schedule.departure.scheduled) {
    delayMinutes = Math.floor((this.schedule.departure.estimated - this.schedule.departure.scheduled) / (1000 * 60))
  } else if (currentTime > this.schedule.departure.scheduled && !this.schedule.departure.actual) {
    delayMinutes = Math.floor((currentTime - this.schedule.departure.scheduled) / (1000 * 60))
  }
  
  this.delay.minutes = Math.max(0, delayMinutes)
  return this.delay.minutes
}

FlightSchema.methods.updateStatus = async function (newStatus, reason = null, updatedBy = 'System', metadata = {}) {
  if (!Object.values(FLIGHT_STATUSES).includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`)
  }
  
  const oldStatus = this.status.current
  
  this.status.history.push({
    status: oldStatus,
    timestamp: new Date(),
    reason: `Changed from ${oldStatus} to ${newStatus}`,
    updatedBy,
    metadata: new Map(Object.entries(metadata))
  })
  
  this.status.current = newStatus
  this.lastUpdated = new Date()
  
  if (newStatus === FLIGHT_STATUSES.DEPARTED && !this.schedule.departure.actual) {
    this.schedule.departure.actual = new Date()
  }
  
  if (newStatus === FLIGHT_STATUSES.ARRIVED && !this.schedule.arrival.actual) {
    this.schedule.arrival.actual = new Date()
  }
  
  await this.calculateDelay()
  
  return this.save()
}

FlightSchema.methods.updateGate = function (terminal, gate, type = 'departure') {
  if (type === 'departure') {
    this.route.origin.terminal = terminal
    this.route.origin.gate = gate
  } else {
    this.route.destination.terminal = terminal
    this.route.destination.gate = gate
  }
  
  this.lastUpdated = new Date()
  return this.save()
}

FlightSchema.methods.addDelay = function (minutes, reason = DELAY_REASONS.OTHER, description = '') {
  this.delay.minutes = Math.max(0, this.delay.minutes + minutes)
  this.delay.reason = reason
  this.delay.description = description
  
  if (this.schedule.departure.estimated) {
    this.schedule.departure.estimated = new Date(this.schedule.departure.estimated.getTime() + (minutes * 60000))
  } else {
    this.schedule.departure.estimated = new Date(this.schedule.departure.scheduled.getTime() + (minutes * 60000))
  }
  
  if (this.schedule.arrival.estimated) {
    this.schedule.arrival.estimated = new Date(this.schedule.arrival.estimated.getTime() + (minutes * 60000))
  } else {
    this.schedule.arrival.estimated = new Date(this.schedule.arrival.scheduled.getTime() + (minutes * 60000))
  }
  
  this.lastUpdated = new Date()
  return this.save()
}

FlightSchema.statics.findByRoute = function (originAirport, destinationAirport, date = null) {
  const query = {
    'route.origin.airport': originAirport.toUpperCase(),
    'route.destination.airport': destinationAirport.toUpperCase(),
    isActive: true
  }
  
  if (date) {
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)
    
    query['schedule.departure.scheduled'] = {
      $gte: startOfDay,
      $lte: endOfDay
    }
  }
  
  return this.find(query).sort({ 'schedule.departure.scheduled': 1 })
}

FlightSchema.statics.findUpcoming = function (hours = 24) {
  const now = new Date()
  const futureTime = new Date(now.getTime() + (hours * 60 * 60 * 1000))
  
  return this.find({
    'schedule.departure.scheduled': {
      $gte: now,
      $lte: futureTime
    },
    'status.current': {
      $nin: [FLIGHT_STATUSES.CANCELLED, FLIGHT_STATUSES.ARRIVED]
    },
    isActive: true
  }).sort({ 'schedule.departure.scheduled': 1 })
}

FlightSchema.statics.findDelayed = function (minimumDelayMinutes = 15) {
  return this.find({
    'delay.minutes': { $gte: minimumDelayMinutes },
    'status.current': {
      $nin: [FLIGHT_STATUSES.CANCELLED, FLIGHT_STATUSES.ARRIVED]
    },
    isActive: true
  }).sort({ 'delay.minutes': -1 })
}

FlightSchema.statics.findByAirline = function (airlineCode) {
  return this.find({
    'airline.code': airlineCode.toUpperCase(),
    isActive: true
  }).sort({ 'schedule.departure.scheduled': -1 })
}

FlightSchema.statics.findByStatus = function (status) {
  return this.find({
    'status.current': status,
    isActive: true
  }).sort({ 'schedule.departure.scheduled': 1 })
}

FlightSchema.index({ flightNumber: 1 })
FlightSchema.index({ 'airline.code': 1 })
FlightSchema.index({ 'route.origin.airport': 1, 'route.destination.airport': 1 })
FlightSchema.index({ 'schedule.departure.scheduled': 1 })
FlightSchema.index({ 'schedule.arrival.scheduled': 1 })
FlightSchema.index({ 'status.current': 1 })
FlightSchema.index({ 'delay.minutes': 1 })
FlightSchema.index({ isActive: 1 })
FlightSchema.index({ lastUpdated: 1 })
FlightSchema.index({ 
  'route.origin.airport': 1, 
  'route.destination.airport': 1, 
  'schedule.departure.scheduled': 1 
})

FlightSchema.pre('save', function (next) {
  this.lastUpdated = new Date()
  
  if (this.isModified('schedule.departure.scheduled') || this.isModified('schedule.arrival.scheduled')) {
    if (this.schedule.departure.scheduled >= this.schedule.arrival.scheduled) {
      return next(new Error('Departure time must be before arrival time'))
    }
  }
  
  if (this.route.origin.airport === this.route.destination.airport) {
    return next(new Error('Origin and destination airports cannot be the same'))
  }
  
  next()
})

module.exports = mongoose.model('Flight', FlightSchema)

module.exports.FLIGHT_STATUSES = FLIGHT_STATUSES
module.exports.DELAY_REASONS = DELAY_REASONS