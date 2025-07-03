const mongoose = require('mongoose')

const FlightSchema = new mongoose.Schema({
  flightNumber: {
    type: String,
    required: [true, 'Flight number is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  airline: {
    type: String,
    required: [true, 'Airline is required'],
    trim: true
  },
  departure: {
    airport: {
      type: String,
      required: [true, 'Departure airport is required'],
      trim: true,
      uppercase: true
    },
    city: {
      type: String,
      required: [true, 'Departure city is required'],
      trim: true
    },
    scheduledTime: {
      type: Date,
      required: [true, 'Scheduled departure time is required']
    },
    actualTime: {
      type: Date
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
  arrival: {
    airport: {
      type: String,
      required: [true, 'Arrival airport is required'],
      trim: true,
      uppercase: true
    },
    city: {
      type: String,
      required: [true, 'Arrival city is required'],
      trim: true
    },
    scheduledTime: {
      type: Date,
      required: [true, 'Scheduled arrival time is required']
    },
    actualTime: {
      type: Date
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
  status: {
    type: String,
    enum: ['scheduled', 'delayed', 'boarding', 'departed', 'in-air', 'landed', 'cancelled'],
    default: 'scheduled'
  },
  aircraft: {
    type: String,
    trim: true
  },
  duration: {
    type: Number
  },
  delay: {
    type: Number,
    default: 0
  },
  passengers: [{
    type: mongoose.Schema.ObjectId,
    ref: 'Passenger'
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
})

FlightSchema.methods.calculateDelay = function () {
  if (this.departure.actualTime && this.departure.scheduledTime) {
    this.delay = Math.floor((this.departure.actualTime - this.departure.scheduledTime) / (1000 * 60))
  }
  return this.delay
}

FlightSchema.methods.updateStatus = function (newStatus) {
  this.status = newStatus
  this.lastUpdated = new Date()
  return this.save()
}

module.exports = mongoose.model('Flight', FlightSchema)