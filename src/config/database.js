const mongoose = require('mongoose')
const { config } = require('./config')
const logger = require('./logger')

class DatabaseManager {
  constructor() {
    this.isConnected = false
    this.retryAttempts = 0
    this.maxRetries = config.database.maxRetries
    this.retryDelay = config.database.retryDelay
    this.connectionPromise = null
  }

  async connect() {
    if (this.isConnected) {
      logger.debug('Database already connected')
      return mongoose.connection
    }

    if (this.connectionPromise) {
      logger.debug('Database connection already in progress')
      return this.connectionPromise
    }

    this.connectionPromise = this._attemptConnection()
    return this.connectionPromise
  }

  async _attemptConnection() {
    const options = this._getConnectionOptions()
    
    while (this.retryAttempts < this.maxRetries) {
      try {
        logger.info(`Attempting database connection (${this.retryAttempts + 1}/${this.maxRetries})`)
        
        const conn = await mongoose.connect(config.database.uri, options)
        
        this.isConnected = true
        this.retryAttempts = 0
        this.connectionPromise = null
        
        logger.info(`MongoDB Connected: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`)
        
        this._setupConnectionHandlers()
        
        return conn
      } catch (error) {
        this.retryAttempts++
        logger.error(`Database connection failed (attempt ${this.retryAttempts}/${this.maxRetries}):`, error.message)
        
        if (this.retryAttempts >= this.maxRetries) {
          logger.error('Max database connection retries exceeded')
          this.connectionPromise = null
          throw new Error(`Database connection failed after ${this.maxRetries} attempts: ${error.message}`)
        }
        
        logger.info(`Retrying connection in ${this.retryDelay}ms...`)
        await this._delay(this.retryDelay)
      }
    }
  }

  _getConnectionOptions() {
    const options = {
      serverSelectionTimeoutMS: config.database.connectionTimeout,
      socketTimeoutMS: config.database.socketTimeout,
      maxPoolSize: config.database.maxPoolSize,
      minPoolSize: config.database.minPoolSize
    }

    if (config.database.user && config.database.password) {
      options.auth = {
        username: config.database.user,
        password: config.database.password
      }
      options.authSource = config.database.authSource
    }

    if (config.database.ssl) {
      options.ssl = true
      options.sslValidate = true
      
      if (config.database.sslCertPath) {
        options.sslCert = require('fs').readFileSync(config.database.sslCertPath)
      }
      
      if (config.database.sslCAPath) {
        options.sslCA = require('fs').readFileSync(config.database.sslCAPath)
      }
    }

    return options
  }

  _setupConnectionHandlers() {
    const connection = mongoose.connection

    connection.on('connected', () => {
      logger.info('MongoDB connection established')
      this.isConnected = true
    })

    connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error.message)
      this.isConnected = false
    })

    connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected')
      this.isConnected = false
    })

    connection.on('reconnected', () => {
      logger.info('MongoDB reconnected')
      this.isConnected = true
    })

    connection.on('close', () => {
      logger.info('MongoDB connection closed')
      this.isConnected = false
    })

    connection.on('fullsetup', () => {
      logger.info('MongoDB replica set connection established')
    })

    connection.on('all', () => {
      logger.info('MongoDB connection to all servers established')
    })
  }

  async disconnect() {
    if (!this.isConnected) {
      logger.debug('Database already disconnected')
      return
    }

    try {
      logger.info('Gracefully closing MongoDB connection...')
      await mongoose.connection.close()
      this.isConnected = false
      logger.info('MongoDB connection closed successfully')
    } catch (error) {
      logger.error('Error closing MongoDB connection:', error.message)
      throw error
    }
  }

  async dropDatabase() {
    if (!this.isConnected) {
      throw new Error('Database not connected')
    }

    if (config.server.nodeEnv === 'production') {
      throw new Error('Cannot drop database in production environment')
    }

    try {
      await mongoose.connection.dropDatabase()
      logger.info('Database dropped successfully')
    } catch (error) {
      logger.error('Error dropping database:', error.message)
      throw error
    }
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected', message: 'Database not connected' }
      }

      const adminDb = mongoose.connection.db.admin()
      const result = await adminDb.ping()
      
      if (result.ok === 1) {
        return {
          status: 'healthy',
          message: 'Database connection is healthy',
          details: {
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name
          }
        }
      } else {
        return { status: 'unhealthy', message: 'Database ping failed' }
      }
    } catch (error) {
      logger.error('Database health check failed:', error.message)
      return { status: 'unhealthy', message: error.message }
    }
  }

  getConnectionInfo() {
    const connection = mongoose.connection
    return {
      readyState: connection.readyState,
      host: connection.host,
      port: connection.port,
      name: connection.name,
      isConnected: this.isConnected,
      retryAttempts: this.retryAttempts
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

const dbManager = new DatabaseManager()

const connectDB = async () => {
  return await dbManager.connect()
}

const disconnectDB = async () => {
  return await dbManager.disconnect()
}

const dropDB = async () => {
  return await dbManager.dropDatabase()
}

const healthCheck = async () => {
  return await dbManager.healthCheck()
}

const getConnectionInfo = () => {
  return dbManager.getConnectionInfo()
}

process.on('SIGINT', async () => {
  logger.info('Received SIGINT signal, gracefully closing database connection...')
  await disconnectDB()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM signal, gracefully closing database connection...')
  await disconnectDB()
  process.exit(0)
})

module.exports = {
  connectDB,
  disconnectDB,
  dropDB,
  healthCheck,
  getConnectionInfo,
  dbManager
}