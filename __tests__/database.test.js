const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')

describe('Database Connection Management', () => {
  let mongoServer

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    const mongoUri = mongoServer.getUri()
    
    process.env.MONGODB_URI = mongoUri
    process.env.MONGODB_TEST_URI = mongoUri
    process.env.NODE_ENV = 'test'
    
    jest.resetModules()
  })

  afterAll(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close()
      }
      await mongoServer.stop()
    } catch (error) {
      console.error('Error in afterAll:', error)
    }
  })

  beforeEach(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close()
      }
    } catch (error) {
      console.error('Error in beforeEach:', error)
    }
  })

  describe('Database Connection', () => {
    it('should connect to database successfully', async () => {
      const { connectDB } = require('../src/config/database')
      const connection = await connectDB()
      expect(connection).toBeDefined()
      expect(mongoose.connection.readyState).toBe(1)
    })

    it('should handle connection info correctly', async () => {
      const { connectDB, getConnectionInfo } = require('../src/config/database')
      await connectDB()
      const info = getConnectionInfo()
      
      expect(info).toHaveProperty('readyState')
      expect(info).toHaveProperty('isConnected')
      expect(info.isConnected).toBe(true)
    })
  })

  describe('Database Health Check', () => {
    it('should return healthy status when connected', async () => {
      const { connectDB, healthCheck } = require('../src/config/database')
      await connectDB()
      const health = await healthCheck()
      
      expect(health.status).toBe('healthy')
      expect(health.message).toBe('Database connection is healthy')
      expect(health.details).toBeDefined()
    })

    it('should return disconnected status when not connected', async () => {
      const { healthCheck } = require('../src/config/database')
      const health = await healthCheck()
      
      expect(health.status).toBe('disconnected')
      expect(health.message).toBe('Database not connected')
    })
  })

  describe('Database Disconnection', () => {
    it('should disconnect from database successfully', async () => {
      const { connectDB, disconnectDB } = require('../src/config/database')
      await connectDB()
      expect(mongoose.connection.readyState).toBe(1)
      
      await disconnectDB()
      expect(mongoose.connection.readyState).toBe(0)
    })
  })
})

describe('Database Manager Class Basic Tests', () => {
  let mongoServer

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    const mongoUri = mongoServer.getUri()
    process.env.MONGODB_URI = mongoUri
    process.env.MONGODB_TEST_URI = mongoUri
    process.env.NODE_ENV = 'test'
  })

  afterAll(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close()
      }
      await mongoServer.stop()
    } catch (error) {
      console.error('Error in afterAll:', error)
    }
  })

  beforeEach(async () => {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close()
      }
      jest.resetModules()
    } catch (error) {
      console.error('Error in beforeEach:', error)
    }
  })

  it('should manage connection state properly', async () => {
    const { dbManager, connectDB, disconnectDB } = require('../src/config/database')
    
    expect(dbManager.isConnected).toBe(false)
    
    await connectDB()
    expect(dbManager.isConnected).toBe(true)
    
    await disconnectDB()
    expect(dbManager.isConnected).toBe(false)
  })

  it('should handle connection options correctly', async () => {
    const { dbManager } = require('../src/config/database')
    const options = dbManager._getConnectionOptions()
    
    expect(options).toHaveProperty('maxPoolSize')
    expect(options).toHaveProperty('minPoolSize')
    expect(options).toHaveProperty('serverSelectionTimeoutMS')
    expect(options).toHaveProperty('socketTimeoutMS')
  })
})