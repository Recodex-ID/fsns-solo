const mongoose = require('mongoose')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const SUBSCRIPTION_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  UNSUBSCRIBED: 'unsubscribed',
  EXPIRED: 'expired'
}

const NOTIFICATION_TYPES = {
  STATUS_CHANGES: 'status_changes',
  DELAYS: 'delays',
  GATE_CHANGES: 'gate_changes',
  CANCELLATIONS: 'cancellations',
  BOARDING_CALLS: 'boarding_calls',
  DEPARTURE_ALERTS: 'departure_alerts',
  ARRIVAL_ALERTS: 'arrival_alerts',
  WEATHER_ALERTS: 'weather_alerts'
}

const NOTIFICATION_METHODS = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push'
}

const validateEmail = function (email) {
  const emailRegex = /^[^\s@\.][^\s@]*@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email) || email.includes('..')) {
    throw new Error('Please provide a valid email address')
  }
  return true
}

const validateFlightNumber = function (flightNumber) {
  const iataPattern = /^[A-Z]{2}[0-9]{1,4}[A-Z]?$/
  if (!iataPattern.test(flightNumber)) {
    throw new Error('Flight number must follow IATA format (e.g., AA123, UA1234A)')
  }
  return true
}

const validateFutureDate = function (date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const flightDate = new Date(date)
  flightDate.setHours(0, 0, 0, 0)
  
  if (flightDate < today) {
    throw new Error('Flight date must be today or in the future')
  }
  return true
}

const validatePNR = function (pnr) {
  if (!pnr) return true
  
  const pnrPattern = /^[A-Z0-9]{6}$/
  if (!pnrPattern.test(pnr.toUpperCase())) {
    throw new Error('PNR must be 6 alphanumeric characters (e.g., ABC123)')
  }
  return true
}

const NotificationPreferencesSchema = new mongoose.Schema({
  [NOTIFICATION_TYPES.STATUS_CHANGES]: {
    enabled: { type: Boolean, default: true },
    methods: {
      type: [String],
      enum: Object.values(NOTIFICATION_METHODS),
      default: [NOTIFICATION_METHODS.EMAIL]
    },
    minDelayMinutes: { type: Number, default: 0 }
  },
  [NOTIFICATION_TYPES.DELAYS]: {
    enabled: { type: Boolean, default: true },
    methods: {
      type: [String],
      enum: Object.values(NOTIFICATION_METHODS),
      default: [NOTIFICATION_METHODS.EMAIL]
    },
    minDelayMinutes: { type: Number, default: 15 }
  },
  [NOTIFICATION_TYPES.GATE_CHANGES]: {
    enabled: { type: Boolean, default: true },
    methods: {
      type: [String],
      enum: Object.values(NOTIFICATION_METHODS),
      default: [NOTIFICATION_METHODS.EMAIL]
    }
  },
  [NOTIFICATION_TYPES.CANCELLATIONS]: {
    enabled: { type: Boolean, default: true },
    methods: {
      type: [String],
      enum: Object.values(NOTIFICATION_METHODS),
      default: [NOTIFICATION_METHODS.EMAIL, NOTIFICATION_METHODS.SMS]
    }
  },
  [NOTIFICATION_TYPES.BOARDING_CALLS]: {
    enabled: { type: Boolean, default: false },
    methods: {
      type: [String],
      enum: Object.values(NOTIFICATION_METHODS),
      default: [NOTIFICATION_METHODS.PUSH]
    },
    advanceMinutes: { type: Number, default: 30 }
  },
  [NOTIFICATION_TYPES.DEPARTURE_ALERTS]: {
    enabled: { type: Boolean, default: false },
    methods: {
      type: [String],
      enum: Object.values(NOTIFICATION_METHODS),
      default: [NOTIFICATION_METHODS.EMAIL]
    },
    advanceMinutes: { type: Number, default: 60 }
  },
  [NOTIFICATION_TYPES.ARRIVAL_ALERTS]: {
    enabled: { type: Boolean, default: false },
    methods: {
      type: [String],
      enum: Object.values(NOTIFICATION_METHODS),
      default: [NOTIFICATION_METHODS.EMAIL]
    },
    advanceMinutes: { type: Number, default: 30 }
  },
  [NOTIFICATION_TYPES.WEATHER_ALERTS]: {
    enabled: { type: Boolean, default: false },
    methods: {
      type: [String],
      enum: Object.values(NOTIFICATION_METHODS),
      default: [NOTIFICATION_METHODS.EMAIL]
    }
  }
}, { _id: false })

const NotificationStatsSchema = new mongoose.Schema({
  totalSent: { type: Number, default: 0 },
  emailsSent: { type: Number, default: 0 },
  smsSent: { type: Number, default: 0 },
  pushSent: { type: Number, default: 0 },
  lastNotificationSent: { type: Date },
  notificationHistory: [{
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: true
    },
    method: {
      type: String,
      enum: Object.values(NOTIFICATION_METHODS),
      required: true
    },
    sentAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['sent', 'failed', 'bounced', 'delivered'],
      default: 'sent'
    },
    messageId: String,
    error: String
  }]
}, { _id: false })

const GDPRComplianceSchema = new mongoose.Schema({
  consentGiven: {
    type: Boolean,
    required: [true, 'GDPR consent is required'],
    validate: {
      validator: function(value) {
        return value === true
      },
      message: 'GDPR consent must be given'
    }
  },
  consentDate: {
    type: Date,
    required: [true, 'Consent date is required'],
    default: Date.now
  },
  consentVersion: {
    type: String,
    required: [true, 'Consent version is required'],
    default: '1.0'
  },
  dataRetentionDays: {
    type: Number,
    default: 365,
    min: [1, 'Data retention must be at least 1 day'],
    max: [3650, 'Data retention cannot exceed 10 years']
  },
  marketingConsent: {
    type: Boolean,
    default: false
  },
  dataProcessingConsent: {
    type: Boolean,
    required: [true, 'Data processing consent is required'],
    validate: {
      validator: function(value) {
        return value === true
      },
      message: 'Data processing consent must be given'
    }
  },
  rightToBeForgatten: {
    requested: { type: Boolean, default: false },
    requestedAt: Date,
    processedAt: Date
  },
  dataExportRequests: [{
    requestedAt: { type: Date, default: Date.now },
    processedAt: Date,
    downloadToken: String,
    expiresAt: Date
  }]
}, { _id: false })

const SubscriptionSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email address is required'],
    trim: true,
    lowercase: true,
    validate: [validateEmail, 'Please provide a valid email address'],
    index: true
  },
  flightNumber: {
    type: String,
    required: [true, 'Flight number is required'],
    trim: true,
    uppercase: true,
    validate: [validateFlightNumber, 'Invalid flight number format'],
    index: true
  },
  flightDate: {
    type: Date,
    required: [true, 'Flight date is required'],
    validate: [validateFutureDate, 'Flight date must be today or in the future'],
    index: true
  },
  pnr: {
    type: String,
    trim: true,
    uppercase: true,
    validate: [validatePNR, 'Invalid PNR format'],
    sparse: true
  },
  passengerInfo: {
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: function (phone) {
          if (!phone) return true
          return /^\+?[1-9]\d{7,14}$/.test(phone)
        },
        message: 'Please provide a valid phone number in E.164 format'
      }
    },
    language: {
      type: String,
      enum: ['en', 'id', 'es', 'fr', 'de', 'ja', 'ko', 'zh'],
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  flight: {
    type: mongoose.Schema.ObjectId,
    ref: 'Flight',
    index: true
  },
  status: {
    type: String,
    enum: Object.values(SUBSCRIPTION_STATUS),
    default: SUBSCRIPTION_STATUS.PENDING,
    index: true
  },
  verification: {
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpires: Date,
    verifiedAt: Date,
    verificationAttempts: { type: Number, default: 0, max: 5 }
  },
  unsubscribe: {
    token: String,
    isUnsubscribed: { type: Boolean, default: false },
    unsubscribedAt: Date,
    reason: {
      type: String,
      enum: ['user_request', 'bounce', 'spam_complaint', 'admin_action', 'gdpr_request', 'expired'],
      trim: true
    },
    feedback: {
      type: String,
      maxlength: [500, 'Feedback cannot exceed 500 characters'],
      trim: true
    }
  },
  notificationPreferences: {
    type: NotificationPreferencesSchema,
    default: () => ({})
  },
  notificationStats: {
    type: NotificationStatsSchema,
    default: () => ({})
  },
  gdprCompliance: {
    type: GDPRComplianceSchema,
    required: [true, 'GDPR compliance data is required'],
    default: () => ({})
  },
  metadata: {
    source: {
      type: String,
      enum: ['website', 'mobile_app', 'api', 'import', 'admin'],
      default: 'website'
    },
    userAgent: String,
    ipAddress: {
      type: String,
      validate: {
        validator: function (ip) {
          if (!ip) return true
          const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
          const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/
          return ipv4Regex.test(ip) || ipv6Regex.test(ip)
        },
        message: 'Please provide a valid IP address'
      }
    },
    referrer: String
  },
  expiresAt: {
    type: Date,
    index: { expireAfterSeconds: 0 }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.verification.verificationToken
      delete ret.unsubscribe.token
      delete ret.metadata.ipAddress
      return ret
    }
  },
  toObject: { virtuals: true }
})

SubscriptionSchema.virtual('isExpired').get(function () {
  return this.expiresAt && new Date() > this.expiresAt
})

SubscriptionSchema.virtual('daysUntilExpiry').get(function () {
  if (!this.expiresAt) return null
  const now = new Date()
  const expiry = new Date(this.expiresAt)
  const diffTime = expiry.getTime() - now.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
})

SubscriptionSchema.virtual('isVerificationExpired').get(function () {
  return this.verification.verificationTokenExpires && 
         new Date() > this.verification.verificationTokenExpires
})

SubscriptionSchema.virtual('gdprExpiryDate').get(function () {
  if (!this.gdprCompliance.dataRetentionDays) return null
  const consentDate = new Date(this.gdprCompliance.consentDate)
  return new Date(consentDate.getTime() + (this.gdprCompliance.dataRetentionDays * 24 * 60 * 60 * 1000))
})

SubscriptionSchema.virtual('notificationCount').get(function () {
  return this.notificationStats.totalSent || 0
})

SubscriptionSchema.pre('save', function (next) {
  if (this.isNew && !this.verification.verificationToken) {
    this.verification.verificationToken = crypto.randomBytes(32).toString('hex')
    this.verification.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  }
  
  if (this.isNew && !this.unsubscribe.token) {
    this.unsubscribe.token = crypto.randomBytes(32).toString('hex')
  }
  
  if (this.isNew && !this.expiresAt) {
    const flightDate = new Date(this.flightDate)
    this.expiresAt = new Date(flightDate.getTime() + (7 * 24 * 60 * 60 * 1000)) // 7 days after flight
  }
  
  if (this.isModified('gdprCompliance.dataRetentionDays') || this.isModified('gdprCompliance.consentDate')) {
    if (this.gdprCompliance.dataRetentionDays && this.gdprCompliance.consentDate) {
      const consentDate = new Date(this.gdprCompliance.consentDate)
      const gdprExpiry = new Date(consentDate.getTime() + (this.gdprCompliance.dataRetentionDays * 24 * 60 * 60 * 1000))
      
      if (!this.expiresAt || gdprExpiry < this.expiresAt) {
        this.expiresAt = gdprExpiry
      }
    }
  }
  
  next()
})

SubscriptionSchema.methods.verify = async function (token) {
  if (this.verification.isVerified) {
    throw new Error('Subscription is already verified')
  }
  
  if (this.isVerificationExpired) {
    throw new Error('Verification token has expired')
  }
  
  if (this.verification.verificationAttempts >= 5) {
    throw new Error('Maximum verification attempts exceeded')
  }
  
  if (this.verification.verificationToken !== token) {
    this.verification.verificationAttempts += 1
    await this.save()
    throw new Error('Invalid verification token')
  }
  
  this.verification.isVerified = true
  this.verification.verifiedAt = new Date()
  this.verification.verificationToken = undefined
  this.verification.verificationTokenExpires = undefined
  this.status = SUBSCRIPTION_STATUS.ACTIVE
  
  return this.save()
}

SubscriptionSchema.methods.unsubscribeUser = async function (token = null, reason = 'user_request', feedback = '') {
  if (this.unsubscribe.isUnsubscribed) {
    throw new Error('Already unsubscribed')
  }
  
  if (token && this.unsubscribe.token !== token) {
    throw new Error('Invalid unsubscribe token')
  }
  
  this.unsubscribe.isUnsubscribed = true
  this.unsubscribe.unsubscribedAt = new Date()
  this.unsubscribe.reason = reason
  this.unsubscribe.feedback = feedback
  this.status = SUBSCRIPTION_STATUS.UNSUBSCRIBED
  this.isActive = false
  
  return this.save()
}

SubscriptionSchema.methods.reactivate = async function () {
  if (!this.unsubscribe.isUnsubscribed) {
    throw new Error('Subscription is not unsubscribed')
  }
  
  if (this.isExpired) {
    throw new Error('Cannot reactivate expired subscription')
  }
  
  this.unsubscribe.isUnsubscribed = false
  this.unsubscribe.unsubscribedAt = undefined
  this.unsubscribe.reason = undefined
  this.unsubscribe.feedback = undefined
  this.status = this.verification.isVerified ? SUBSCRIPTION_STATUS.ACTIVE : SUBSCRIPTION_STATUS.PENDING
  this.isActive = true
  
  return this.save()
}

SubscriptionSchema.methods.addNotification = function (type, method, status = 'sent', messageId = null, error = null) {
  this.notificationStats.totalSent += 1
  this.notificationStats.lastNotificationSent = new Date()
  
  switch (method) {
    case NOTIFICATION_METHODS.EMAIL:
      this.notificationStats.emailsSent += 1
      break
    case NOTIFICATION_METHODS.SMS:
      this.notificationStats.smsSent += 1
      break
    case NOTIFICATION_METHODS.PUSH:
      this.notificationStats.pushSent += 1
      break
  }
  
  this.notificationStats.notificationHistory.push({
    type,
    method,
    status,
    messageId,
    error
  })
  
  if (this.notificationStats.notificationHistory.length > 100) {
    this.notificationStats.notificationHistory = this.notificationStats.notificationHistory.slice(-50)
  }
  
  return this.save()
}

SubscriptionSchema.methods.requestDataExport = async function () {
  const downloadToken = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  
  this.gdprCompliance.dataExportRequests.push({
    downloadToken,
    expiresAt
  })
  
  await this.save()
  return downloadToken
}

SubscriptionSchema.methods.requestDeletion = async function () {
  this.gdprCompliance.rightToBeForgatten.requested = true
  this.gdprCompliance.rightToBeForgatten.requestedAt = new Date()
  
  await this.save()
  return true
}

SubscriptionSchema.statics.findActiveByFlight = function (flightNumber, flightDate) {
  const query = {
    flightNumber: flightNumber.toUpperCase(),
    isActive: true,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PENDING] },
    'unsubscribe.isUnsubscribed': false
  }
  
  if (flightDate) {
    const startOfDay = new Date(flightDate)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(flightDate)
    endOfDay.setHours(23, 59, 59, 999)
    
    query.flightDate = { $gte: startOfDay, $lte: endOfDay }
  }
  
  return this.find(query)
    .populate('flight', 'status schedule route airline')
    .sort({ createdAt: 1 })
}

SubscriptionSchema.statics.findByEmail = function (email) {
  return this.find({
    email: email.toLowerCase(),
    isActive: true,
    'unsubscribe.isUnsubscribed': false
  })
    .populate('flight', 'flightNumber status schedule route airline')
    .sort({ flightDate: 1 })
}

SubscriptionSchema.statics.findExpiring = function (days = 7) {
  const expiryDate = new Date()
  expiryDate.setDate(expiryDate.getDate() + days)
  
  return this.find({
    expiresAt: { $lte: expiryDate },
    isActive: true,
    'unsubscribe.isUnsubscribed': false
  }).sort({ expiresAt: 1 })
}

SubscriptionSchema.statics.findUnverified = function (hoursOld = 24) {
  const cutoffDate = new Date()
  cutoffDate.setHours(cutoffDate.getHours() - hoursOld)
  
  return this.find({
    'verification.isVerified': false,
    createdAt: { $lte: cutoffDate },
    'verification.verificationAttempts': { $lt: 5 },
    isActive: true
  }).sort({ createdAt: 1 })
}

SubscriptionSchema.statics.findForNotification = function (flightNumber, flightDate, notificationType) {
  return this.find({
    flightNumber: flightNumber.toUpperCase(),
    flightDate: {
      $gte: new Date(flightDate).setHours(0, 0, 0, 0),
      $lte: new Date(flightDate).setHours(23, 59, 59, 999)
    },
    'verification.isVerified': true,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    'unsubscribe.isUnsubscribed': false,
    [`notificationPreferences.${notificationType}.enabled`]: true,
    isActive: true
  }).populate('flight')
}

SubscriptionSchema.index({ email: 1, flightNumber: 1, flightDate: 1 }, { unique: true })
SubscriptionSchema.index({ flightNumber: 1, flightDate: 1 })
SubscriptionSchema.index({ email: 1 })
SubscriptionSchema.index({ status: 1 })
SubscriptionSchema.index({ 'verification.isVerified': 1 })
SubscriptionSchema.index({ 'unsubscribe.isUnsubscribed': 1 })
SubscriptionSchema.index({ expiresAt: 1 })
SubscriptionSchema.index({ isActive: 1 })
SubscriptionSchema.index({ createdAt: 1 })
SubscriptionSchema.index({ 'verification.verificationTokenExpires': 1 })

module.exports = mongoose.model('Subscription', SubscriptionSchema)

module.exports.SUBSCRIPTION_STATUS = SUBSCRIPTION_STATUS
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES
module.exports.NOTIFICATION_METHODS = NOTIFICATION_METHODS