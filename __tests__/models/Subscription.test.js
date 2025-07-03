const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

describe('Subscription Model', () => {
  let mongoServer
  let Subscription, SUBSCRIPTION_STATUS, NOTIFICATION_TYPES, NOTIFICATION_METHODS

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    const mongoUri = mongoServer.getUri()
    await mongoose.connect(mongoUri)
    
    const SubscriptionModule = require('../../src/models/Subscription')
    Subscription = SubscriptionModule
    SUBSCRIPTION_STATUS = SubscriptionModule.SUBSCRIPTION_STATUS
    NOTIFICATION_TYPES = SubscriptionModule.NOTIFICATION_TYPES
    NOTIFICATION_METHODS = SubscriptionModule.NOTIFICATION_METHODS
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongoServer.stop()
  })

  beforeEach(async () => {
    await Subscription.deleteMany({})
  })

  describe('Schema Validation', () => {
    const validSubscriptionData = {
      email: 'passenger@example.com',
      flightNumber: 'AA123',
      flightDate: new Date('2025-07-10'),
      passengerInfo: {
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        language: 'en',
        timezone: 'UTC'
      },
      gdprCompliance: {
        consentGiven: true,
        dataProcessingConsent: true
      }
    }

    it('should create a valid subscription', async () => {
      const subscription = new Subscription(validSubscriptionData)
      const savedSubscription = await subscription.save()

      expect(savedSubscription._id).toBeDefined()
      expect(savedSubscription.email).toBe('passenger@example.com')
      expect(savedSubscription.flightNumber).toBe('AA123')
      expect(savedSubscription.status).toBe(SUBSCRIPTION_STATUS.PENDING)
      expect(savedSubscription.verification.verificationToken).toBeDefined()
      expect(savedSubscription.unsubscribe.token).toBeDefined()
    })

    it('should validate email format', async () => {
      const invalidEmails = ['invalid-email', 'test@', '@domain.com', 'test..test@domain.com']

      for (const email of invalidEmails) {
        const subscription = new Subscription({
          ...validSubscriptionData,
          email
        })

        await expect(subscription.save()).rejects.toThrow(/valid email/)
      }
    })

    it('should accept valid email formats', async () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'test+tag@example.org',
        'firstname-lastname@example.com'
      ]

      for (const email of validEmails) {
        const subscription = new Subscription({
          ...validSubscriptionData,
          email
        })

        const savedSubscription = await subscription.save()
        expect(savedSubscription.email).toBe(email.toLowerCase())
        await Subscription.deleteOne({ _id: savedSubscription._id })
      }
    })

    it('should validate IATA flight number format', async () => {
      const invalidFlightNumbers = ['A123', '123', 'AAA123', '12ABC', 'AA12345']

      for (const flightNumber of invalidFlightNumbers) {
        const subscription = new Subscription({
          ...validSubscriptionData,
          flightNumber
        })

        await expect(subscription.save()).rejects.toThrow(/IATA format/)
      }
    })

    it('should accept valid IATA flight number formats', async () => {
      const validFlightNumbers = ['AA123', 'UA1234', 'QF9', 'BA123A']

      for (const flightNumber of validFlightNumbers) {
        const subscription = new Subscription({
          ...validSubscriptionData,
          flightNumber
        })

        const savedSubscription = await subscription.save()
        expect(savedSubscription.flightNumber).toBe(flightNumber)
        await Subscription.deleteOne({ _id: savedSubscription._id })
      }
    })

    it('should validate future flight dates', async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1)

      const subscription = new Subscription({
        ...validSubscriptionData,
        flightDate: pastDate
      })

      await expect(subscription.save()).rejects.toThrow(/future/)
    })

    it('should validate PNR format when provided', async () => {
      const invalidPNRs = ['ABC12', 'ABCD123', '12345', 'ABC@123', 'AB-123']

      for (const pnr of invalidPNRs) {
        const subscription = new Subscription({
          ...validSubscriptionData,
          pnr
        })

        await expect(subscription.save()).rejects.toThrow(/PNR/)
      }
    })

    it('should accept valid PNR formats', async () => {
      const validPNRs = ['ABC123', 'XYZ999', '123ABC', '999XYZ']

      for (const pnr of validPNRs) {
        const subscription = new Subscription({
          ...validSubscriptionData,
          pnr
        })

        const savedSubscription = await subscription.save()
        expect(savedSubscription.pnr).toBe(pnr)
        await Subscription.deleteOne({ _id: savedSubscription._id })
      }
    })

    it('should validate phone number format', async () => {
      const invalidPhones = ['123', '+', '123-456-7890', 'invalid']

      for (const phone of invalidPhones) {
        const subscription = new Subscription({
          ...validSubscriptionData,
          passengerInfo: {
            ...validSubscriptionData.passengerInfo,
            phone
          }
        })

        await expect(subscription.save()).rejects.toThrow(/phone number/)
      }
    })

    it('should validate IP address format in metadata', async () => {
      const invalidIPs = ['256.1.1.1', '192.168.1', 'invalid-ip', '192.168.1.1.1']

      for (const ipAddress of invalidIPs) {
        const subscription = new Subscription({
          ...validSubscriptionData,
          metadata: { ipAddress }
        })

        await expect(subscription.save()).rejects.toThrow(/IP address/)
      }
    })

    it('should enforce unique email-flight-date combination', async () => {
      const subscription1 = new Subscription(validSubscriptionData)
      await subscription1.save()

      const subscription2 = new Subscription(validSubscriptionData)
      await expect(subscription2.save()).rejects.toThrow(/duplicate/)
    })

    it('should require GDPR consent', async () => {
      const subscription = new Subscription({
        ...validSubscriptionData,
        gdprCompliance: {
          consentGiven: false,
          dataProcessingConsent: false
        }
      })

      await expect(subscription.save()).rejects.toThrow(/consent/)
    })
  })

  describe('Virtual Fields', () => {
    let subscription

    beforeEach(async () => {
      subscription = new Subscription({
        email: 'test@example.com',
        flightNumber: 'UA456',
        flightDate: new Date('2025-07-15'),
        gdprCompliance: {
          consentGiven: true,
          dataProcessingConsent: true
        }
      })
      await subscription.save()
    })

    it('should calculate isExpired virtual field', () => {
      expect(subscription.isExpired).toBe(false)
      
      subscription.expiresAt = new Date()
      subscription.expiresAt.setDate(subscription.expiresAt.getDate() - 1)
      expect(subscription.isExpired).toBe(true)
    })

    it('should calculate daysUntilExpiry virtual field', () => {
      subscription.expiresAt = new Date()
      subscription.expiresAt.setDate(subscription.expiresAt.getDate() + 5)
      expect(subscription.daysUntilExpiry).toBe(5)
      
      subscription.expiresAt = null
      expect(subscription.daysUntilExpiry).toBeNull()
    })

    it('should calculate isVerificationExpired virtual field', () => {
      expect(subscription.isVerificationExpired).toBe(false)
      
      subscription.verification.verificationTokenExpires = new Date()
      subscription.verification.verificationTokenExpires.setHours(subscription.verification.verificationTokenExpires.getHours() - 1)
      expect(subscription.isVerificationExpired).toBe(true)
    })

    it('should calculate gdprExpiryDate virtual field', () => {
      const expectedExpiry = new Date(subscription.gdprCompliance.consentDate)
      expectedExpiry.setDate(expectedExpiry.getDate() + subscription.gdprCompliance.dataRetentionDays)
      
      expect(subscription.gdprExpiryDate.getTime()).toBeCloseTo(expectedExpiry.getTime(), -1000)
    })

    it('should calculate notificationCount virtual field', () => {
      expect(subscription.notificationCount).toBe(0)
      
      subscription.notificationStats.totalSent = 5
      expect(subscription.notificationCount).toBe(5)
    })
  })

  describe('Pre-save Middleware', () => {
    it('should generate verification token for new subscriptions', async () => {
      const subscription = new Subscription({
        email: 'test@example.com',
        flightNumber: 'DL789',
        flightDate: new Date('2025-07-20'),
        gdprCompliance: {
          consentGiven: true,
          dataProcessingConsent: true
        }
      })

      await subscription.save()
      
      expect(subscription.verification.verificationToken).toBeDefined()
      expect(subscription.verification.verificationToken).toHaveLength(64)
      expect(subscription.verification.verificationTokenExpires).toBeInstanceOf(Date)
    })

    it('should generate unsubscribe token for new subscriptions', async () => {
      const subscription = new Subscription({
        email: 'test@example.com',
        flightNumber: 'SW123',
        flightDate: new Date('2025-07-25'),
        gdprCompliance: {
          consentGiven: true,
          dataProcessingConsent: true
        }
      })

      await subscription.save()
      
      expect(subscription.unsubscribe.token).toBeDefined()
      expect(subscription.unsubscribe.token).toHaveLength(64)
    })

    it('should set expiry date based on flight date', async () => {
      const flightDate = new Date('2025-07-30')
      const subscription = new Subscription({
        email: 'test@example.com',
        flightNumber: 'JB456',
        flightDate,
        gdprCompliance: {
          consentGiven: true,
          dataProcessingConsent: true
        }
      })

      await subscription.save()
      
      const expectedExpiry = new Date(flightDate.getTime() + (7 * 24 * 60 * 60 * 1000))
      expect(subscription.expiresAt.getTime()).toBeCloseTo(expectedExpiry.getTime(), -1000)
    })

    it('should update expiry based on GDPR retention policy', async () => {
      const subscription = new Subscription({
        email: 'test@example.com',
        flightNumber: 'NK789',
        flightDate: new Date('2025-08-01'),
        gdprCompliance: {
          consentGiven: true,
          dataProcessingConsent: true,
          dataRetentionDays: 30
        }
      })

      await subscription.save()
      
      const gdprExpiry = new Date(subscription.gdprCompliance.consentDate)
      gdprExpiry.setDate(gdprExpiry.getDate() + 30)
      
      expect(subscription.expiresAt.getTime()).toBeCloseTo(gdprExpiry.getTime(), -1000)
    })
  })

  describe('Instance Methods', () => {
    let subscription

    beforeEach(async () => {
      subscription = new Subscription({
        email: 'test@example.com',
        flightNumber: 'AA999',
        flightDate: new Date('2025-08-05'),
        gdprCompliance: {
          consentGiven: true,
          dataProcessingConsent: true
        }
      })
      await subscription.save()
    })

    describe('verify()', () => {
      it('should verify subscription with correct token', async () => {
        const token = subscription.verification.verificationToken
        await subscription.verify(token)
        
        expect(subscription.verification.isVerified).toBe(true)
        expect(subscription.verification.verifiedAt).toBeInstanceOf(Date)
        expect(subscription.verification.verificationToken).toBeUndefined()
        expect(subscription.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
      })

      it('should reject invalid verification token', async () => {
        await expect(subscription.verify('invalid-token')).rejects.toThrow(/Invalid verification token/)
        expect(subscription.verification.verificationAttempts).toBe(1)
      })

      it('should reject verification for already verified subscription', async () => {
        subscription.verification.isVerified = true
        await subscription.save()
        
        await expect(subscription.verify('any-token')).rejects.toThrow(/already verified/)
      })

      it('should reject verification after token expiry', async () => {
        subscription.verification.verificationTokenExpires = new Date()
        subscription.verification.verificationTokenExpires.setHours(subscription.verification.verificationTokenExpires.getHours() - 1)
        await subscription.save()
        
        await expect(subscription.verify(subscription.verification.verificationToken)).rejects.toThrow(/expired/)
      })

      it('should reject verification after maximum attempts', async () => {
        subscription.verification.verificationAttempts = 5
        await subscription.save()
        
        await expect(subscription.verify('invalid-token')).rejects.toThrow(/Maximum verification attempts/)
      })
    })

    describe('unsubscribeUser()', () => {
      it('should unsubscribe with correct token', async () => {
        const token = subscription.unsubscribe.token
        await subscription.unsubscribeUser(token, 'user_request', 'No longer needed')
        
        expect(subscription.unsubscribe.isUnsubscribed).toBe(true)
        expect(subscription.unsubscribe.unsubscribedAt).toBeInstanceOf(Date)
        expect(subscription.unsubscribe.reason).toBe('user_request')
        expect(subscription.unsubscribe.feedback).toBe('No longer needed')
        expect(subscription.status).toBe(SUBSCRIPTION_STATUS.UNSUBSCRIBED)
        expect(subscription.isActive).toBe(false)
      })

      it('should unsubscribe without token (admin action)', async () => {
        await subscription.unsubscribeUser(null, 'admin_action', 'Compliance requirement')
        
        expect(subscription.unsubscribe.isUnsubscribed).toBe(true)
        expect(subscription.unsubscribe.reason).toBe('admin_action')
      })

      it('should reject unsubscribe with invalid token', async () => {
        await expect(subscription.unsubscribeUser('invalid-token')).rejects.toThrow(/Invalid unsubscribe token/)
      })

      it('should reject unsubscribe for already unsubscribed', async () => {
        subscription.unsubscribe.isUnsubscribed = true
        await subscription.save()
        
        await expect(subscription.unsubscribeUser()).rejects.toThrow(/Already unsubscribed/)
      })
    })

    describe('reactivate()', () => {
      beforeEach(async () => {
        await subscription.unsubscribeUser(null, 'user_request')
      })

      it('should reactivate unsubscribed subscription', async () => {
        await subscription.reactivate()
        
        expect(subscription.unsubscribe.isUnsubscribed).toBe(false)
        expect(subscription.unsubscribe.unsubscribedAt).toBeUndefined()
        expect(subscription.unsubscribe.reason).toBeUndefined()
        expect(subscription.isActive).toBe(true)
        expect(subscription.status).toBe(SUBSCRIPTION_STATUS.PENDING)
      })

      it('should set status to ACTIVE if already verified', async () => {
        subscription.verification.isVerified = true
        await subscription.save()
        
        await subscription.reactivate()
        expect(subscription.status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
      })

      it('should reject reactivation for non-unsubscribed subscription', async () => {
        subscription.unsubscribe.isUnsubscribed = false
        await subscription.save()
        
        await expect(subscription.reactivate()).rejects.toThrow(/not unsubscribed/)
      })

      it('should reject reactivation for expired subscription', async () => {
        subscription.expiresAt = new Date()
        subscription.expiresAt.setDate(subscription.expiresAt.getDate() - 1)
        await subscription.save()
        
        await expect(subscription.reactivate()).rejects.toThrow(/expired/)
      })
    })

    describe('addNotification()', () => {
      it('should add email notification to stats', async () => {
        await subscription.addNotification(NOTIFICATION_TYPES.DELAYS, NOTIFICATION_METHODS.EMAIL, 'sent', 'msg123')
        
        expect(subscription.notificationStats.totalSent).toBe(1)
        expect(subscription.notificationStats.emailsSent).toBe(1)
        expect(subscription.notificationStats.lastNotificationSent).toBeInstanceOf(Date)
        expect(subscription.notificationStats.notificationHistory).toHaveLength(1)
        expect(subscription.notificationStats.notificationHistory[0].type).toBe(NOTIFICATION_TYPES.DELAYS)
        expect(subscription.notificationStats.notificationHistory[0].messageId).toBe('msg123')
      })

      it('should add SMS notification to stats', async () => {
        await subscription.addNotification(NOTIFICATION_TYPES.CANCELLATIONS, NOTIFICATION_METHODS.SMS)
        
        expect(subscription.notificationStats.smsSent).toBe(1)
      })

      it('should add push notification to stats', async () => {
        await subscription.addNotification(NOTIFICATION_TYPES.BOARDING_CALLS, NOTIFICATION_METHODS.PUSH)
        
        expect(subscription.notificationStats.pushSent).toBe(1)
      })

      it('should limit notification history to 100 entries', async () => {
        for (let i = 0; i < 110; i++) {
          subscription.notificationStats.notificationHistory.push({
            type: NOTIFICATION_TYPES.STATUS_CHANGES,
            method: NOTIFICATION_METHODS.EMAIL,
            status: 'sent'
          })
        }
        
        await subscription.addNotification(NOTIFICATION_TYPES.DELAYS, NOTIFICATION_METHODS.EMAIL)
        
        expect(subscription.notificationStats.notificationHistory).toHaveLength(50)
      })
    })

    describe('requestDataExport()', () => {
      it('should create data export request', async () => {
        const token = await subscription.requestDataExport()
        
        expect(token).toBeDefined()
        expect(token).toHaveLength(64)
        expect(subscription.gdprCompliance.dataExportRequests).toHaveLength(1)
        expect(subscription.gdprCompliance.dataExportRequests[0].downloadToken).toBe(token)
        expect(subscription.gdprCompliance.dataExportRequests[0].expiresAt).toBeInstanceOf(Date)
      })
    })

    describe('requestDeletion()', () => {
      it('should request right to be forgotten', async () => {
        const result = await subscription.requestDeletion()
        
        expect(result).toBe(true)
        expect(subscription.gdprCompliance.rightToBeForgatten.requested).toBe(true)
        expect(subscription.gdprCompliance.rightToBeForgatten.requestedAt).toBeInstanceOf(Date)
      })
    })
  })

  describe('Static Methods', () => {
    beforeEach(async () => {
      const testSubscriptions = [
        {
          email: 'user1@example.com',
          flightNumber: 'AA100',
          flightDate: new Date('2025-07-10'),
          verification: { isVerified: true },
          status: SUBSCRIPTION_STATUS.ACTIVE,
          gdprCompliance: { consentGiven: true, dataProcessingConsent: true }
        },
        {
          email: 'user2@example.com',
          flightNumber: 'AA100',
          flightDate: new Date('2025-07-10'),
          verification: { isVerified: false },
          status: SUBSCRIPTION_STATUS.PENDING,
          gdprCompliance: { consentGiven: true, dataProcessingConsent: true }
        },
        {
          email: 'user3@example.com',
          flightNumber: 'UA200',
          flightDate: new Date('2025-07-11'),
          verification: { isVerified: true },
          status: SUBSCRIPTION_STATUS.ACTIVE,
          'unsubscribe.isUnsubscribed': true,
          isActive: false,
          gdprCompliance: { consentGiven: true, dataProcessingConsent: true }
        },
        {
          email: 'user1@example.com',
          flightNumber: 'DL300',
          flightDate: new Date('2025-07-12'),
          verification: { isVerified: true },
          status: SUBSCRIPTION_STATUS.ACTIVE,
          expiresAt: new Date('2025-07-05'),
          gdprCompliance: { consentGiven: true, dataProcessingConsent: true }
        }
      ]

      await Subscription.insertMany(testSubscriptions)
    })

    describe('findActiveByFlight()', () => {
      it('should find active subscriptions by flight number', async () => {
        const subscriptions = await Subscription.findActiveByFlight('AA100')
        
        expect(subscriptions).toHaveLength(2)
        expect(subscriptions.every(sub => sub.flightNumber === 'AA100')).toBe(true)
        expect(subscriptions.every(sub => sub.isActive === true)).toBe(true)
      })

      it('should find active subscriptions by flight number and date', async () => {
        const subscriptions = await Subscription.findActiveByFlight('AA100', new Date('2025-07-10'))
        
        expect(subscriptions).toHaveLength(2)
        expect(subscriptions.every(sub => sub.flightNumber === 'AA100')).toBe(true)
      })

      it('should return empty array for non-existent flight', async () => {
        const subscriptions = await Subscription.findActiveByFlight('XX999')
        expect(subscriptions).toHaveLength(0)
      })
    })

    describe('findByEmail()', () => {
      it('should find active subscriptions by email', async () => {
        const subscriptions = await Subscription.findByEmail('user1@example.com')
        
        expect(subscriptions).toHaveLength(2)
        expect(subscriptions.every(sub => sub.email === 'user1@example.com')).toBe(true)
        expect(subscriptions.every(sub => sub.isActive === true)).toBe(true)
      })

      it('should sort subscriptions by flight date', async () => {
        const subscriptions = await Subscription.findByEmail('user1@example.com')
        
        expect(subscriptions[0].flightDate.getTime()).toBeLessThan(subscriptions[1].flightDate.getTime())
      })
    })

    describe('findExpiring()', () => {
      it('should find subscriptions expiring within specified days', async () => {
        const subscriptions = await Subscription.findExpiring(30)
        
        expect(subscriptions).toHaveLength(1)
        expect(subscriptions[0].email).toBe('user1@example.com')
        expect(subscriptions[0].flightNumber).toBe('DL300')
      })
    })

    describe('findUnverified()', () => {
      it('should find unverified subscriptions older than specified hours', async () => {
        const subscriptions = await Subscription.findUnverified(0)
        
        expect(subscriptions).toHaveLength(1)
        expect(subscriptions[0].verification.isVerified).toBe(false)
        expect(subscriptions[0].isActive).toBe(true)
      })
    })

    describe('findForNotification()', () => {
      it('should find subscriptions eligible for notifications', async () => {
        const subscriptions = await Subscription.findForNotification('AA100', new Date('2025-07-10'), NOTIFICATION_TYPES.DELAYS)
        
        expect(subscriptions).toHaveLength(1)
        expect(subscriptions[0].verification.isVerified).toBe(true)
        expect(subscriptions[0].status).toBe(SUBSCRIPTION_STATUS.ACTIVE)
      })

      it('should exclude unverified subscriptions', async () => {
        const subscriptions = await Subscription.findForNotification('AA100', new Date('2025-07-10'), NOTIFICATION_TYPES.STATUS_CHANGES)
        
        expect(subscriptions.every(sub => sub.verification.isVerified === true)).toBe(true)
      })
    })
  })

  describe('Notification Preferences', () => {
    let subscription

    beforeEach(async () => {
      subscription = new Subscription({
        email: 'test@example.com',
        flightNumber: 'AA123',
        flightDate: new Date('2025-07-15'),
        gdprCompliance: {
          consentGiven: true,
          dataProcessingConsent: true
        }
      })
      await subscription.save()
    })

    it('should have default notification preferences', () => {
      expect(subscription.notificationPreferences.status_changes.enabled).toBe(true)
      expect(subscription.notificationPreferences.delays.enabled).toBe(true)
      expect(subscription.notificationPreferences.gate_changes.enabled).toBe(true)
      expect(subscription.notificationPreferences.cancellations.enabled).toBe(true)
      expect(subscription.notificationPreferences.boarding_calls.enabled).toBe(false)
      expect(subscription.notificationPreferences.departure_alerts.enabled).toBe(false)
    })

    it('should have correct default notification methods', () => {
      expect(subscription.notificationPreferences.cancellations.methods).toEqual([NOTIFICATION_METHODS.EMAIL, NOTIFICATION_METHODS.SMS])
      expect(subscription.notificationPreferences.boarding_calls.methods).toEqual([NOTIFICATION_METHODS.PUSH])
    })

    it('should have correct default delay thresholds', () => {
      expect(subscription.notificationPreferences.status_changes.minDelayMinutes).toBe(0)
      expect(subscription.notificationPreferences.delays.minDelayMinutes).toBe(15)
    })

    it('should have correct default advance notification times', () => {
      expect(subscription.notificationPreferences.boarding_calls.advanceMinutes).toBe(30)
      expect(subscription.notificationPreferences.departure_alerts.advanceMinutes).toBe(60)
    })
  })

  describe('Indexes', () => {
    it('should have proper indexes for performance', async () => {
      const indexes = await Subscription.collection.getIndexes()
      
      expect(indexes).toHaveProperty('email_1_flightNumber_1_flightDate_1')
      expect(indexes).toHaveProperty('email_1')
      expect(indexes).toHaveProperty('flightNumber_1_flightDate_1')
      expect(indexes).toHaveProperty('status_1')
      expect(indexes).toHaveProperty('isActive_1')
    })
  })

  describe('JSON Transformation', () => {
    let subscription

    beforeEach(async () => {
      subscription = new Subscription({
        email: 'test@example.com',
        flightNumber: 'AA123',
        flightDate: new Date('2025-07-15'),
        metadata: {
          ipAddress: '192.168.1.1'
        },
        gdprCompliance: {
          consentGiven: true,
          dataProcessingConsent: true
        }
      })
      await subscription.save()
    })

    it('should hide sensitive fields in JSON output', () => {
      const json = subscription.toJSON()
      
      expect(json.verification.verificationToken).toBeUndefined()
      expect(json.unsubscribe.token).toBeUndefined()
      expect(json.metadata.ipAddress).toBeUndefined()
    })

    it('should include virtual fields in JSON output', () => {
      const json = subscription.toJSON()
      
      expect(json.isExpired).toBeDefined()
      expect(json.daysUntilExpiry).toBeDefined()
      expect(json.notificationCount).toBeDefined()
    })
  })
})