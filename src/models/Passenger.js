const mongoose = require('mongoose')

const PassengerSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email'
    ]
  },
  phone: {
    type: String,
    trim: true,
    match: [
      /^[\+]?[1-9][\d]{0,15}$/,
      'Please enter a valid phone number'
    ]
  },
  bookingReference: {
    type: String,
    required: [true, 'Booking reference is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  flights: [{
    type: mongoose.Schema.ObjectId,
    ref: 'Flight'
  }],
  notifications: {
    email: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: false
    },
    push: {
      type: Boolean,
      default: true
    }
  },
  preferences: {
    notificationTiming: {
      type: Number,
      default: 60,
      min: [15, 'Minimum notification time is 15 minutes'],
      max: [1440, 'Maximum notification time is 24 hours']
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'id', 'es', 'fr', 'de']
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
})

PassengerSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`
})

PassengerSchema.methods.addFlight = function (flightId) {
  if (!this.flights.includes(flightId)) {
    this.flights.push(flightId)
  }
  return this.save()
}

PassengerSchema.methods.removeFlight = function (flightId) {
  this.flights = this.flights.filter(id => id.toString() !== flightId.toString())
  return this.save()
}

module.exports = mongoose.model('Passenger', PassengerSchema)