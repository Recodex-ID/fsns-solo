const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const compression = require('compression')
const rateLimit = require('express-rate-limit')

const { config } = require('./config/config')
const logger = require('./config/logger')
const errorHandler = require('./middleware/errorHandler')
const { healthCheck, getConnectionInfo } = require('./config/database')

const app = express()

const limiter = rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.maxRequests,
  skipSuccessfulRequests: config.security.rateLimit.skipSuccessfulRequests,
  skipFailedRequests: config.security.rateLimit.skipFailedRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl
    })
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(config.security.rateLimit.windowMs / 1000)
    })
  }
})

const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    },
    reportUri: config.security.csp.reportUri,
    reportOnly: config.security.csp.reportOnly
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || config.security.cors.origin.includes(origin)) {
      callback(null, true)
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: config.security.cors.credentials,
  methods: config.security.cors.methods,
  allowedHeaders: config.security.cors.allowedHeaders,
  exposedHeaders: ['X-Total-Count', 'X-Request-ID'],
  maxAge: 86400
}

app.set('trust proxy', 1)

app.use(helmet(helmetConfig))
app.use(cors(corsOptions))
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false
    }
    return compression.filter(req, res)
  }
}))

if (config.server.nodeEnv === 'development') {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }))
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    },
    skip: (req, res) => res.statusCode < 400
  }))
}

app.use(express.json({
  limit: '10mb',
  strict: true,
  type: ['application/json']
}))

app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
  parameterLimit: 50
}))

app.use((req, res, next) => {
  req.requestId = require('crypto').randomUUID()
  res.setHeader('X-Request-ID', req.requestId)
  
  logger.debug(`${req.method} ${req.originalUrl}`, {
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  })
  
  next()
})

app.use('/api', limiter)

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Flight Status Notification System API',
    version: '1.0.0',
    environment: config.server.nodeEnv,
    apiVersion: config.server.apiVersion,
    status: 'operational',
    timestamp: new Date().toISOString(),
    documentation: '/api/docs'
  })
})

app.get('/api/health', async (req, res) => {
  try {
    const startTime = Date.now()
    const dbHealth = await healthCheck()
    const responseTime = Date.now() - startTime
    
    const memoryUsage = process.memoryUsage()
    const connectionInfo = getConnectionInfo()
    
    const healthStatus = {
      success: true,
      status: dbHealth.status === 'healthy' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(process.uptime()),
        formatted: formatUptime(process.uptime())
      },
      database: {
        status: dbHealth.status,
        message: dbHealth.message,
        responseTime: `${responseTime}ms`,
        connection: {
          readyState: connectionInfo.readyState,
          host: connectionInfo.host,
          port: connectionInfo.port,
          name: connectionInfo.name
        }
      },
      server: {
        environment: config.server.nodeEnv,
        version: '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid
      },
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`
      },
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : 'N/A (Windows)',
      requestId: req.requestId
    }
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503
    res.status(statusCode).json(healthStatus)
    
  } catch (error) {
    logger.error('Health check failed:', error)
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      error: config.server.nodeEnv === 'development' ? error.message : 'Internal server error',
      requestId: req.requestId
    })
  }
})

app.get('/api/docs', (req, res) => {
  const apiDocs = {
    success: true,
    title: 'Flight Status Notification System API Documentation',
    version: '1.0.0',
    description: 'Comprehensive API for aviation flight status notifications and passenger management',
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    endpoints: {
      health: {
        path: '/api/health',
        method: 'GET',
        description: 'System health check with database and server status',
        response: 'Health status object with uptime, memory, and database information'
      },
      documentation: {
        path: '/api/docs',
        method: 'GET',
        description: 'API documentation and endpoint information',
        response: 'This documentation object'
      },
      flights: {
        path: '/api/flights',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Flight management endpoints for CRUD operations',
        authentication: 'Required for POST, PUT, DELETE operations'
      },
      passengers: {
        path: '/api/passengers',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'Passenger management and registration endpoints',
        authentication: 'Required for administrative operations'
      },
      notifications: {
        path: '/api/notifications',
        methods: ['GET', 'POST'],
        description: 'Flight notification management and delivery',
        authentication: 'Required'
      },
      auth: {
        path: '/api/auth',
        methods: ['POST'],
        description: 'Authentication endpoints for admin login and token management',
        subpaths: ['/login', '/refresh', '/logout']
      }
    },
    authentication: {
      type: 'Bearer Token (JWT)',
      header: 'Authorization: Bearer <token>',
      tokenExpiry: config.jwt.expiresIn,
      refreshTokenExpiry: config.jwt.refreshExpiresIn
    },
    rateLimit: {
      windowMs: config.security.rateLimit.windowMs,
      maxRequests: config.security.rateLimit.maxRequests,
      message: 'Rate limiting applied to all /api/* endpoints'
    },
    errorHandling: {
      format: {
        success: false,
        error: 'Error message',
        code: 'ERROR_CODE',
        timestamp: 'ISO 8601 timestamp',
        requestId: 'Unique request identifier'
      }
    },
    responseFormat: {
      success: {
        success: true,
        data: 'Response data object',
        timestamp: 'ISO 8601 timestamp',
        requestId: 'Unique request identifier'
      }
    },
    contact: {
      organization: 'PT EDIfly Solusi Indonesia',
      purpose: 'Aviation Industry Backend Development',
      environment: config.server.nodeEnv
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  }
  
  res.json(apiDocs)
})

app.all('*', (req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    requestId: req.requestId
  })
  
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/docs'
    ],
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  })
})

app.use(errorHandler)

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  parts.push(`${secs}s`)
  
  return parts.join(' ')
}

module.exports = app