const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')
const NotificationService = require('../../src/services/NotificationService')
const Subscription = require('../../src/models/Subscription')
const { SUBSCRIPTION_STATUS, NOTIFICATION_TYPES, NOTIFICATION_METHODS } = require('../../src/models/Subscription')
const { FLIGHT_STATUSES } = require('../../src/models/Flight')

// Mock SendGrid
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn()
}))

describe('NotificationService', () => {
  let mongoServer
  let notificationService
  let mockLogger
  let sgMail

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
    await Subscription.deleteMany({})
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    }
    
    // Mock environment variables
    process.env.NOTIFICATION_MODE = 'console'
    process.env.SENDGRID_API_KEY = 'test-api-key'
    process.env.SENDGRID_FROM_EMAIL = 'test@fsns.com'
    process.env.NOTIFICATION_RETRY_ATTEMPTS = '3'
    process.env.NOTIFICATION_RETRY_DELAY = '1000'
    
    sgMail = require('@sendgrid/mail')
    sgMail.send.mockClear()
    sgMail.setApiKey.mockClear()
    
    notificationService = new NotificationService(mockLogger)
  })

  const validFlightData = {
    _id: new mongoose.Types.ObjectId(),
    flightNumber: 'AA123',
    airline: {
      code: 'AA',
      name: 'American Airlines',
      icao: 'AAL'
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
      }
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
    },
    status: {
      current: FLIGHT_STATUSES.BOARDING
    },
    delay: {
      minutes: 15,
      reason: 'Weather',
      description: 'Slight weather delay'
    }
  }

  const validSubscription = {
    email: 'passenger@example.com',
    flightNumber: 'AA123',
    flightDate: new Date('2025-07-10T08:00:00Z'),
    passengerInfo: {
      firstName: 'John',
      lastName: 'Doe',
      language: 'en'
    },
    status: SUBSCRIPTION_STATUS.ACTIVE,
    verification: {
      isVerified: true,
      verificationToken: 'test-token-123'
    },
    gdprCompliance: {
      consentGiven: true,
      dataProcessingConsent: true,
      consentDate: new Date(),
      consentVersion: '1.0'
    }
  }

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const service = new NotificationService()
      
      expect(service.config.mode).toBe('console')
      expect(service.config.retryAttempts).toBe(3)
      expect(service.isEnabled).toBe(true)
    })

    it('should initialize with custom configuration', () => {
      const customConfig = {
        mode: 'sendgrid',
        retryAttempts: 5,
        rateLimit: { maxPerHour: 200 }
      }
      
      const service = new NotificationService(mockLogger, customConfig)
      
      expect(service.config.mode).toBe('sendgrid')
      expect(service.config.retryAttempts).toBe(5)
      expect(service.config.rateLimit.maxPerHour).toBe(200)
    })

    it('should fall back to console mode if SendGrid initialization fails', () => {
      sgMail.setApiKey.mockImplementation(() => {
        throw new Error('Invalid API key')
      })
      
      process.env.NOTIFICATION_MODE = 'sendgrid'
      const service = new NotificationService(mockLogger)
      
      expect(service.config.mode).toBe('console')
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize email transporter',
        expect.objectContaining({ error: 'Invalid API key' })
      )
    })
  })

  describe('Main Notification Methods', () => {
    beforeEach(async () => {
      // Create a test subscription
      await Subscription.create(validSubscription)
    })

    describe('notifyStatusChange()', () => {
      it('should process notifications for active subscriptions', async () => {
        const result = await notificationService.notifyStatusChange(
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED,
          'TestUser'
        )

        expect(result.success).toBe(true)
        expect(result.notificationsSent).toBe(1)
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Processing flight status change notification',
          expect.objectContaining({
            flightNumber: 'AA123',
            oldStatus: FLIGHT_STATUSES.SCHEDULED,
            newStatus: FLIGHT_STATUSES.BOARDING
          })
        )
      })

      it('should skip notifications when service is disabled', async () => {
        notificationService.disable()
        
        const result = await notificationService.notifyStatusChange(
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.success).toBe(true)
        expect(result.message).toBe('Service disabled')
      })

      it('should handle no active subscriptions gracefully', async () => {
        await Subscription.deleteMany({})
        
        const result = await notificationService.notifyStatusChange(
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.success).toBe(true)
        expect(result.notificationsSent).toBe(0)
        expect(result.message).toBe('No subscriptions found')
      })

      it('should respect passenger notification preferences', async () => {
        // Create subscription that doesn't want boarding notifications
        await Subscription.findOneAndUpdate(
          { email: 'passenger@example.com' },
          { 'notificationPreferences.status_changes.enabled': false }
        )

        const result = await notificationService.notifyStatusChange(
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.notificationsSent).toBe(0)
      })

      it('should apply rate limiting correctly', async () => {
        // Set rate limit to 1 per hour
        notificationService.config.rateLimit.maxPerHour = 1

        // First notification should succeed
        await notificationService.notifyStatusChange(
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        // Update rate limit manually to exceed limit
        notificationService.updateRateLimit('passenger@example.com')

        // Second notification should be rate limited
        const result = await notificationService.notifyStatusChange(
          validFlightData,
          FLIGHT_STATUSES.BOARDING
        )

        expect(result.details[0].status).toBe('rate_limited')
      })

      it('should handle notification failures gracefully', async () => {
        jest.spyOn(notificationService, 'sendStatusChangeEmail')
          .mockRejectedValue(new Error('Email sending failed'))

        const result = await notificationService.notifyStatusChange(
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.success).toBe(true)
        expect(result.notificationsFailed).toBe(1)
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to send notification',
          expect.any(Object)
        )
      })
    })

    describe('sendStatusChangeEmail()', () => {
      let subscription

      beforeEach(async () => {
        subscription = await Subscription.findOne({ email: 'passenger@example.com' })
      })

      it('should send email notification successfully in console mode', async () => {
        const result = await notificationService.sendStatusChangeEmail(
          subscription,
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.success).toBe(true)
        expect(result.method).toBe('console')
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Email sent via console'),
          expect.objectContaining({
            to: 'passenger@example.com'
          })
        )
      })

      it('should send email via SendGrid when configured', async () => {
        notificationService.config.mode = 'sendgrid'
        sgMail.send.mockResolvedValue([{ statusCode: 202 }])

        const result = await notificationService.sendStatusChangeEmail(
          subscription,
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.success).toBe(true)
        expect(result.method).toBe('sendgrid')
        expect(sgMail.send).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'passenger@example.com',
            from: expect.any(Object),
            subject: expect.stringContaining('AA123'),
            html: expect.stringContaining('Flight Status Update'),
            text: expect.any(String)
          })
        )
      })

      it('should implement retry logic for failed emails', async () => {
        notificationService.config.mode = 'sendgrid'
        sgMail.send
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockResolvedValueOnce([{ statusCode: 202 }])

        const result = await notificationService.sendStatusChangeEmail(
          subscription,
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.success).toBe(true)
        expect(result.retryAttempt).toBe(1)
        expect(sgMail.send).toHaveBeenCalledTimes(2)
      })

      it('should fail after exhausting retry attempts', async () => {
        notificationService.config.mode = 'sendgrid'
        notificationService.config.retryAttempts = 2
        sgMail.send.mockRejectedValue(new Error('Persistent failure'))

        const result = await notificationService.sendStatusChangeEmail(
          subscription,
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.success).toBe(false)
        expect(sgMail.send).toHaveBeenCalledTimes(3) // Initial + 2 retries
      })
    })

    describe('sendVerificationEmail()', () => {
      let subscription

      beforeEach(async () => {
        subscription = await Subscription.create({
          ...validSubscription,
          verification: {
            isVerified: false,
            verificationToken: 'verification-token-123'
          }
        })
      })

      it('should send verification email successfully', async () => {
        const result = await notificationService.sendVerificationEmail(subscription)

        expect(result.success).toBe(true)
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('Verification Required'),
          expect.objectContaining({
            to: subscription.passengerEmail
          })
        )
      })

      it('should include verification link in email', async () => {
        const result = await notificationService.sendVerificationEmail(subscription)

        expect(result.emailContent.html).toContain('verification-token-123')
        expect(result.emailContent.text).toContain('verification-token-123')
      })

      it('should handle already verified subscriptions', async () => {
        subscription.verification.isVerified = true
        await subscription.save()

        try {
          await notificationService.sendVerificationEmail(subscription)
        } catch (error) {
          expect(error.message).toContain('already verified')
        }
      })
    })
  })

  describe('Email Template Generation', () => {
    describe('generateEmailContent()', () => {
      let subscription

      beforeEach(async () => {
        subscription = await Subscription.findOne({ email: 'passenger@example.com' })
      })

      it('should generate complete email content with HTML and text', () => {
        const result = notificationService.generateEmailContent(
          subscription,
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.subject).toContain('AA123')
        expect(result.subject).toContain('Boarding')
        expect(result.html).toContain('PT EDIfly Solusi Indonesia')
        expect(result.html).toContain('John')
        expect(result.html).toContain('JFK')
        expect(result.html).toContain('LAX')
        expect(result.text).toContain('Flight Status Update')
        expect(result.text).toContain('AA123')
      })

      it('should include delay information when present', () => {
        const result = notificationService.generateEmailContent(
          subscription,
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.html).toContain('15 minutes')
        expect(result.html).toContain('Weather')
        expect(result.text).toContain('Delay: 15 minutes')
      })

      it('should generate different content for different status changes', () => {
        const departedResult = notificationService.generateEmailContent(
          subscription,
          { ...validFlightData, status: { current: FLIGHT_STATUSES.DEPARTED } },
          FLIGHT_STATUSES.BOARDING
        )

        expect(departedResult.subject).toContain('Departed')
        expect(departedResult.html).toContain('has departed')
      })

      it('should include unsubscribe link in all emails', () => {
        const result = notificationService.generateEmailContent(
          subscription,
          validFlightData,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.html).toContain('unsubscribe')
        expect(result.text).toContain('unsubscribe')
      })

      it('should handle international flights correctly', () => {
        const internationalFlight = {
          ...validFlightData,
          route: {
            ...validFlightData.route,
            destination: {
              ...validFlightData.route.destination,
              country: 'United Kingdom'
            }
          }
        }

        const result = notificationService.generateEmailContent(
          subscription,
          internationalFlight,
          FLIGHT_STATUSES.SCHEDULED
        )

        expect(result.html).toContain('International Flight')
      })
    })

    describe('generateStatusSpecificContent()', () => {
      it('should generate boarding-specific content', () => {
        const result = notificationService.generateStatusSpecificContent(
          FLIGHT_STATUSES.BOARDING,
          validFlightData
        )

        expect(result.title).toContain('Boarding')
        expect(result.message).toContain('boarding')
        expect(result.actionRequired).toBe(true)
      })

      it('should generate departure-specific content', () => {
        const result = notificationService.generateStatusSpecificContent(
          FLIGHT_STATUSES.DEPARTED,
          validFlightData
        )

        expect(result.title).toContain('Departed')
        expect(result.message).toContain('departed')
        expect(result.actionRequired).toBe(false)
      })

      it('should generate cancellation-specific content', () => {
        const result = notificationService.generateStatusSpecificContent(
          FLIGHT_STATUSES.CANCELLED,
          validFlightData
        )

        expect(result.title).toContain('Cancelled')
        expect(result.urgent).toBe(true)
        expect(result.actionRequired).toBe(true)
      })
    })
  })

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      await Subscription.create(validSubscription)
    })

    it('should enforce hourly rate limits', async () => {
      notificationService.config.rateLimit.maxPerHour = 1

      // First notification should succeed
      const result1 = await notificationService.notifyStatusChange(
        validFlightData,
        FLIGHT_STATUSES.SCHEDULED
      )
      expect(result1.notificationsSent).toBe(1)

      // Second notification should be rate limited
      const result2 = await notificationService.notifyStatusChange(
        validFlightData,
        FLIGHT_STATUSES.BOARDING
      )
      expect(result2.details[0].rateLimited).toBe(true)
    })

    it('should enforce daily rate limits', async () => {
      notificationService.config.rateLimit.maxPerDay = 1

      // First notification should succeed
      const result1 = await notificationService.notifyStatusChange(
        validFlightData,
        FLIGHT_STATUSES.SCHEDULED
      )
      expect(result1.notificationsSent).toBe(1)

      // Second notification should be rate limited
      const result2 = await notificationService.notifyStatusChange(
        validFlightData,
        FLIGHT_STATUSES.BOARDING
      )
      expect(result2.details[0].rateLimited).toBe(true)
    })

    it('should reset rate limits correctly', () => {
      const email = 'test@example.com'
      notificationService.config.rateLimit.maxPerHour = 2

      // Send notifications to approach limit
      notificationService.updateRateLimit(email)
      notificationService.updateRateLimit(email)

      expect(notificationService.checkRateLimit(email)).toBe(false)

      // Reset rate limit
      notificationService.resetRateLimit(email)

      expect(notificationService.checkRateLimit(email)).toBe(true)
    })
  })

  describe('GDPR Compliance', () => {
    let subscription

    beforeEach(async () => {
      subscription = await Subscription.create(validSubscription)
    })

    it('should process data deletion requests', async () => {
      const result = await notificationService.processDataDeletionRequest(
        subscription.email
      )

      expect(result.success).toBe(true)
      expect(result.deletedRecords).toBeGreaterThan(0)

      // Verify subscription is deleted
      const deletedSubscription = await Subscription.findOne({
        email: subscription.email
      })
      expect(deletedSubscription).toBeNull()
    })

    it('should export passenger data correctly', async () => {
      const result = await notificationService.exportPassengerData(
        subscription.email
      )

      expect(result.success).toBe(true)
      expect(result.data.subscriptions).toHaveLength(1)
      expect(result.data.subscriptions[0]).toHaveProperty('flightNumber', 'AA123')
      expect(result.data.notifications).toBeDefined()
    })

    it('should minimize data in notifications', () => {
      const emailContent = notificationService.generateEmailContent(
        subscription,
        validFlightData,
        FLIGHT_STATUSES.SCHEDULED
      )

      // Should only include necessary passenger information
      expect(emailContent.html).toContain('John')
      expect(emailContent.html).not.toContain(subscription._id)
      expect(emailContent.text).not.toContain('verification')
    })

    it('should include consent information in verification emails', async () => {
      subscription.verification.isVerified = false
      await subscription.save()

      const result = await notificationService.sendVerificationEmail(subscription)

      expect(result.emailContent.html).toContain('consent')
      expect(result.emailContent.html).toContain('privacy')
    })
  })

  describe('Service Health and Monitoring', () => {
    it('should return healthy status when all checks pass', async () => {
      const health = await notificationService.getServiceHealth()

      expect(health.service).toBe('NotificationService')
      expect(health.status).toBe('healthy')
      expect(health.checks.emailTransporter.status).toBe('healthy')
      expect(health.checks.rateLimit.status).toBe('healthy')
    })

    it('should return unhealthy status when disabled', async () => {
      notificationService.disable()

      const health = await notificationService.getServiceHealth()

      expect(health.status).toBe('unhealthy')
      expect(health.checks.serviceEnabled.status).toBe('unhealthy')
    })

    it('should provide statistics', () => {
      const stats = notificationService.getStatistics()

      expect(stats).toHaveProperty('totalNotificationsSent')
      expect(stats).toHaveProperty('notificationsByMethod')
      expect(stats).toHaveProperty('failureRate')
      expect(stats).toHaveProperty('averageRetryAttempts')
    })
  })

  describe('Service Control', () => {
    it('should enable and disable service correctly', () => {
      expect(notificationService.isEnabled).toBe(true)

      notificationService.disable()
      expect(notificationService.isEnabled).toBe(false)

      notificationService.enable()
      expect(notificationService.isEnabled).toBe(true)
    })

    it('should update configuration dynamically', () => {
      const newConfig = {
        rateLimit: { maxPerHour: 500 },
        retryAttempts: 5
      }

      notificationService.updateConfig(newConfig)

      expect(notificationService.config.rateLimit.maxPerHour).toBe(500)
      expect(notificationService.config.retryAttempts).toBe(5)
    })
  })

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      await mongoose.connection.close()

      const result = await notificationService.notifyStatusChange(
        validFlightData,
        FLIGHT_STATUSES.SCHEDULED
      )

      expect(result.success).toBe(false)
      expect(mockLogger.error).toHaveBeenCalled()

      // Reconnect for other tests
      const mongoUri = mongoServer.getUri()
      await mongoose.connect(mongoUri)
    })

    it('should handle invalid flight data gracefully', async () => {
      const invalidFlight = { ...validFlightData, flightNumber: null }

      const result = await notificationService.notifyStatusChange(
        invalidFlight,
        FLIGHT_STATUSES.SCHEDULED
      )

      expect(result.success).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid flight data provided',
        expect.any(Object)
      )
    })

    it('should handle missing subscription data gracefully', async () => {
      try {
        await notificationService.sendVerificationEmail(null)
      } catch (error) {
        expect(error.message).toContain('email')
      }
    })

    it('should log all errors appropriately', async () => {
      notificationService.config.mode = 'sendgrid'
      sgMail.send.mockRejectedValue(new Error('SendGrid error'))

      await Subscription.create(validSubscription)

      await notificationService.notifyStatusChange(
        validFlightData,
        FLIGHT_STATUSES.SCHEDULED
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to send notification',
        expect.objectContaining({
          error: 'SendGrid error',
          email: validSubscription.email
        })
      )
    })
  })

  describe('Integration Tests', () => {
    beforeEach(async () => {
      await Subscription.create(validSubscription)
    })

    it('should handle complete notification workflow', async () => {
      // Status change: Scheduled -> Boarding
      const result1 = await notificationService.notifyStatusChange(
        validFlightData,
        FLIGHT_STATUSES.SCHEDULED
      )

      expect(result1.success).toBe(true)
      expect(result1.notificationsSent).toBe(1)

      // Status change: Boarding -> Departed
      const departedFlight = {
        ...validFlightData,
        status: { current: FLIGHT_STATUSES.DEPARTED }
      }

      const result2 = await notificationService.notifyStatusChange(
        departedFlight,
        FLIGHT_STATUSES.BOARDING
      )

      expect(result2.success).toBe(true)
      expect(result2.notificationsSent).toBe(1)
    })

    it('should handle multiple subscribers for same flight', async () => {
      // Add another subscription for the same flight
      await Subscription.create({
        ...validSubscription,
        email: 'passenger2@example.com',
        passengerInfo: {
          ...validSubscription.passengerInfo,
          firstName: 'Jane',
          lastName: 'Smith'
        }
      })

      const result = await notificationService.notifyStatusChange(
        validFlightData,
        FLIGHT_STATUSES.SCHEDULED
      )

      expect(result.success).toBe(true)
      expect(result.notificationsSent).toBe(2)
    })

    it('should handle webhook notifications when configured', async () => {
      notificationService.config.mode = 'webhook'
      notificationService.config.webhook = {
        url: 'https://example.com/webhook',
        headers: { 'Authorization': 'Bearer test-token' }
      }

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      })
      global.fetch = mockFetch

      const result = await notificationService.notifyStatusChange(
        validFlightData,
        FLIGHT_STATUSES.SCHEDULED
      )

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token'
          })
        })
      )
    })
  })
})