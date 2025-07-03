require('dotenv').config()
const { createServer } = require('http')
const { Server } = require('socket.io')

const app = require('./app')
const { config } = require('./config/config')
const { connectDB, disconnectDB } = require('./config/database')
const logger = require('./config/logger')

class FSNSServer {
  constructor() {
    this.server = null
    this.io = null
    this.isShuttingDown = false
    this.connections = new Set()
    this.socketConnections = new Map()
  }

  async initialize() {
    try {
      logger.info('🚀 Initializing Flight Status Notification System...')
      
      await this.connectDatabase()
      this.createHttpServer()
      this.setupSocketIO()
      this.setupGracefulShutdown()
      
      logger.info('✅ FSNS initialization completed successfully')
    } catch (error) {
      logger.error('❌ Failed to initialize FSNS:', error)
      process.exit(1)
    }
  }

  async connectDatabase() {
    try {
      logger.info('📊 Connecting to database...')
      await connectDB()
      logger.info('✅ Database connected successfully')
    } catch (error) {
      logger.error('❌ Database connection failed:', error)
      throw error
    }
  }

  createHttpServer() {
    this.server = createServer(app)
    
    this.server.on('connection', (connection) => {
      this.connections.add(connection)
      
      connection.on('close', () => {
        this.connections.delete(connection)
      })
    })

    this.server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${config.server.port} is already in use`)
        process.exit(1)
      } else {
        logger.error('❌ Server error:', error)
      }
    })

    logger.info('🌐 HTTP server created')
  }

  setupSocketIO() {
    this.io = new Server(this.server, {
      cors: {
        origin: config.security.cors.origin,
        methods: ['GET', 'POST'],
        credentials: config.security.cors.credentials
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling']
    })

    this.io.on('connection', (socket) => {
      const clientInfo = {
        id: socket.id,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        connectedAt: new Date().toISOString()
      }

      this.socketConnections.set(socket.id, clientInfo)
      
      logger.info(`🔌 WebSocket client connected: ${socket.id}`, {
        clientsCount: this.socketConnections.size,
        clientInfo
      })

      socket.on('subscribe-flight', (flightNumber) => {
        if (typeof flightNumber === 'string' && flightNumber.length <= 10) {
          socket.join(`flight-${flightNumber.toUpperCase()}`)
          logger.debug(`📡 Client ${socket.id} subscribed to flight ${flightNumber}`)
        }
      })

      socket.on('unsubscribe-flight', (flightNumber) => {
        if (typeof flightNumber === 'string') {
          socket.leave(`flight-${flightNumber.toUpperCase()}`)
          logger.debug(`📡 Client ${socket.id} unsubscribed from flight ${flightNumber}`)
        }
      })

      socket.on('disconnect', (reason) => {
        this.socketConnections.delete(socket.id)
        logger.info(`🔌 WebSocket client disconnected: ${socket.id}`, {
          reason,
          clientsCount: this.socketConnections.size
        })
      })

      socket.on('error', (error) => {
        logger.error(`🔌 WebSocket error for client ${socket.id}:`, error)
      })
    })

    app.set('io', this.io)
    logger.info('🔌 Socket.IO server configured')
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server.listen(config.server.port, config.server.host, (error) => {
        if (error) {
          logger.error('❌ Failed to start server:', error)
          reject(error)
          return
        }

        const address = this.server.address()
        const serverUrl = `http://${address.address === '::' ? 'localhost' : address.address}:${address.port}`
        
        logger.info(`🚀 FSNS Server started successfully`, {
          url: serverUrl,
          environment: config.server.nodeEnv,
          nodeVersion: process.version,
          pid: process.pid,
          timestamp: new Date().toISOString()
        })

        logger.info(`📋 Available endpoints:`)
        logger.info(`   • Health Check: ${serverUrl}/api/health`)
        logger.info(`   • Documentation: ${serverUrl}/api/docs`)
        logger.info(`   • WebSocket: ${serverUrl} (Socket.IO)`)

        resolve()
      })
    })
  }

  setupGracefulShutdown() {
    const signals = ['SIGINT', 'SIGTERM', 'SIGUSR2']
    
    signals.forEach((signal) => {
      process.on(signal, () => {
        logger.info(`🛑 Received ${signal}, starting graceful shutdown...`)
        this.gracefulShutdown(signal)
      })
    })

    process.on('uncaughtException', (error) => {
      logger.error('💥 Uncaught Exception:', error)
      this.gracefulShutdown('uncaughtException')
    })

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('💥 Unhandled Promise Rejection:', { reason, promise })
      this.gracefulShutdown('unhandledRejection')
    })
  }

  async gracefulShutdown(signal) {
    if (this.isShuttingDown) {
      logger.warn('⚠️ Shutdown already in progress, forcing exit...')
      process.exit(1)
    }

    this.isShuttingDown = true
    const shutdownTimeout = 30000

    logger.info(`🛑 Graceful shutdown initiated (${signal})`)
    
    const shutdownTimer = setTimeout(() => {
      logger.error('⏰ Shutdown timeout reached, forcing exit')
      process.exit(1)
    }, shutdownTimeout)

    try {
      if (this.io) {
        logger.info('🔌 Closing WebSocket connections...')
        this.io.disconnectSockets(true)
        this.io.close()
        logger.info('✅ WebSocket server closed')
      }

      if (this.server) {
        logger.info('🌐 Closing HTTP server...')
        await new Promise((resolve) => {
          this.server.close(resolve)
        })
        
        for (const connection of this.connections) {
          connection.destroy()
        }
        logger.info('✅ HTTP server closed')
      }

      logger.info('📊 Disconnecting from database...')
      await disconnectDB()
      logger.info('✅ Database disconnected')

      clearTimeout(shutdownTimer)
      logger.info('✅ Graceful shutdown completed successfully')
      process.exit(0)

    } catch (error) {
      logger.error('❌ Error during graceful shutdown:', error)
      clearTimeout(shutdownTimer)
      process.exit(1)
    }
  }

  broadcastToFlight(flightNumber, event, data) {
    if (this.io) {
      this.io.to(`flight-${flightNumber.toUpperCase()}`).emit(event, data)
      logger.debug(`📡 Broadcast to flight ${flightNumber}:`, { event, data })
    }
  }

  getServerStats() {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      activeConnections: this.connections.size,
      socketConnections: this.socketConnections.size,
      environment: config.server.nodeEnv,
      nodeVersion: process.version,
      pid: process.pid
    }
  }
}

const fsnsServer = new FSNSServer()

if (require.main === module) {
  fsnsServer.initialize()
    .then(() => fsnsServer.start())
    .catch((error) => {
      logger.error('💥 Failed to start FSNS server:', error)
      process.exit(1)
    })
}

module.exports = { fsnsServer, FSNSServer }