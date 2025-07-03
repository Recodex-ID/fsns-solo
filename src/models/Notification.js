const mongoose = require('mongoose')

const NotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['flight_delay', 'flight_cancellation', 'gate_change', 'boarding_call', 'flight_update', 'weather_alert'],
    required: [true, 'Notification type is required']
  },
  flight: {
    type: mongoose.Schema.ObjectId,
    ref: 'Flight',
    required: [true, 'Flight reference is required']
  },
  passenger: {
    type: mongoose.Schema.ObjectId,
    ref: 'Passenger',
    required: [true, 'Passenger reference is required']
  },
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  channels: {
    email: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      error: String
    },
    sms: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      error: String
    },
    push: {
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      error: String
    }
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'cancelled'],
    default: 'pending'
  },
  scheduledAt: {
    type: Date,
    default: Date.now
  },
  sentAt: Date,
  retryCount: {
    type: Number,
    default: 0,
    max: 3
  },
  metadata: {
    type: Map,
    of: String
  }
}, {
  timestamps: true
})

NotificationSchema.methods.markAsSent = function (channel) {
  if (this.channels[channel]) {
    this.channels[channel].sent = true
    this.channels[channel].sentAt = new Date()
  }
  
  const allSent = Object.values(this.channels).every(ch => ch.sent === true)
  if (allSent) {
    this.status = 'sent'
    this.sentAt = new Date()
  }
  
  return this.save()
}

NotificationSchema.methods.markAsFailed = function (channel, error) {
  if (this.channels[channel]) {
    this.channels[channel].error = error
  }
  
  this.retryCount += 1
  
  if (this.retryCount >= 3) {
    this.status = 'failed'
  }
  
  return this.save()
}

NotificationSchema.index({ flight: 1, passenger: 1, type: 1 })
NotificationSchema.index({ status: 1, scheduledAt: 1 })

module.exports = mongoose.model('Notification', NotificationSchema)