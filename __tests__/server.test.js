const { MongoMemoryServer } = require('mongodb-memory-server')
const { FSNSServer } = require('../src/server')

describe('FSNS Server', () => {
  let mongoServer
  let fsnsServer

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    const mongoUri = mongoServer.getUri()
    
    process.env.MONGODB_URI = mongoUri
    process.env.MONGODB_TEST_URI = mongoUri
    process.env.NODE_ENV = 'test'
    process.env.PORT = '0'
    
    jest.resetModules()
  })

  afterAll(async () => {
    if (fsnsServer && fsnsServer.server) {
      await fsnsServer.gracefulShutdown('test')
    }
    if (mongoServer) {
      await mongoServer.stop()
    }
  })

  beforeEach(() => {
    fsnsServer = new FSNSServer()
  })

  afterEach(async () => {
    if (fsnsServer && fsnsServer.server && fsnsServer.server.listening) {
      await new Promise((resolve) => {
        fsnsServer.server.close(resolve)
      })
    }
  })

  describe('Server Initialization', () => {
    it('should initialize server successfully', async () => {
      await expect(fsnsServer.initialize()).resolves.not.toThrow()
      
      expect(fsnsServer.server).toBeDefined()
      expect(fsnsServer.io).toBeDefined()
    })

    it('should create HTTP server with proper configuration', async () => {
      await fsnsServer.initialize()
      
      expect(fsnsServer.server).toBeDefined()
      expect(fsnsServer.connections).toBeDefined()
      expect(fsnsServer.connections.size).toBe(0)
    })

    it('should setup Socket.IO server', async () => {
      await fsnsServer.initialize()
      
      expect(fsnsServer.io).toBeDefined()
      expect(fsnsServer.socketConnections).toBeDefined()
      expect(fsnsServer.socketConnections.size).toBe(0)
    })
  })

  describe('Database Connection', () => {
    it('should connect to database during initialization', async () => {
      await expect(fsnsServer.connectDatabase()).resolves.not.toThrow()
    })

    it('should handle database connection errors', async () => {
      const originalUri = process.env.MONGODB_URI
      process.env.MONGODB_URI = 'mongodb://invalid-host:27017/test'
      
      jest.resetModules()
      const { FSNSServer: FSNSServerWithError } = require('../src/server')
      const errorServer = new FSNSServerWithError()
      
      await expect(errorServer.connectDatabase()).rejects.toThrow()
      
      process.env.MONGODB_URI = originalUri
    })
  })

  describe('Server Statistics', () => {
    it('should return server statistics', async () => {
      await fsnsServer.initialize()
      
      const stats = fsnsServer.getServerStats()
      
      expect(stats).toHaveProperty('uptime')
      expect(stats).toHaveProperty('memoryUsage')
      expect(stats).toHaveProperty('activeConnections')
      expect(stats).toHaveProperty('socketConnections')
      expect(stats).toHaveProperty('environment')
      expect(stats).toHaveProperty('nodeVersion')
      expect(stats).toHaveProperty('pid')
      
      expect(typeof stats.uptime).toBe('number')
      expect(typeof stats.activeConnections).toBe('number')
      expect(typeof stats.socketConnections).toBe('number')
      expect(stats.environment).toBe('test')
    })
  })

  describe('Flight Broadcasting', () => {
    it('should have broadcast functionality', async () => {
      await fsnsServer.initialize()
      
      expect(typeof fsnsServer.broadcastToFlight).toBe('function')
      
      fsnsServer.broadcastToFlight('FL123', 'status-update', {
        status: 'delayed',
        delay: 30
      })
    })
  })

  describe('Server Lifecycle', () => {
    it('should start server on available port', async () => {
      await fsnsServer.initialize()
      await fsnsServer.start()
      
      expect(fsnsServer.server.listening).toBe(true)
      
      const address = fsnsServer.server.address()
      expect(address).toBeDefined()
      expect(address.port).toBeGreaterThan(0)
    })

    it('should handle graceful shutdown', async () => {
      await fsnsServer.initialize()
      await fsnsServer.start()
      
      expect(fsnsServer.server.listening).toBe(true)
      
      const shutdownPromise = fsnsServer.gracefulShutdown('test')
      
      await expect(shutdownPromise).resolves.not.toThrow()
    }, 10000)
  })

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      await fsnsServer.initialize()
      
      const mockError = new Error('Test error')
      mockError.code = 'EADDRINUSE'
      
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {})
      
      fsnsServer.server.emit('error', mockError)
      
      expect(exitSpy).toHaveBeenCalledWith(1)
      
      exitSpy.mockRestore()
    })

    it('should setup graceful shutdown handlers', async () => {
      const processOnSpy = jest.spyOn(process, 'on')
      
      await fsnsServer.initialize()
      
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function))
      expect(processOnSpy).toHaveBeenCalledWith('SIGUSR2', expect.any(Function))
      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function))
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function))
      
      processOnSpy.mockRestore()
    })
  })

  describe('Socket.IO Configuration', () => {
    it('should configure Socket.IO with proper settings', async () => {
      await fsnsServer.initialize()
      
      expect(fsnsServer.io).toBeDefined()
      expect(fsnsServer.io.opts).toBeDefined()
      expect(fsnsServer.io.opts.pingTimeout).toBe(60000)
      expect(fsnsServer.io.opts.pingInterval).toBe(25000)
    })
  })
})