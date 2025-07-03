const path = require('path')
const crypto = require('crypto')

class ConfigError extends Error {
  constructor(message, variable) {
    super(message)
    this.name = 'ConfigError'
    this.variable = variable
  }
}

const validateRequired = (value, name, type = 'string') => {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    throw new ConfigError(`Required environment variable ${name} is missing or empty`, name)
  }
  
  if (type === 'number') {
    const num = parseInt(value, 10)
    if (isNaN(num)) {
      throw new ConfigError(`Environment variable ${name} must be a valid number`, name)
    }
    return num
  }
  
  if (type === 'boolean') {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true'
    }
    return Boolean(value)
  }
  
  return value
}

const validateOptional = (value, defaultValue, type = 'string') => {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return defaultValue
  }
  
  if (type === 'number') {
    const num = parseInt(value, 10)
    return isNaN(num) ? defaultValue : num
  }
  
  if (type === 'boolean') {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true'
    }
    return Boolean(value)
  }
  
  return value
}

const validateJWTSecret = (secret, name) => {
  if (!secret || secret.length < 32) {
    throw new ConfigError(`${name} must be at least 32 characters long for security`, name)
  }
  
  if (secret.includes('your-') || secret.includes('example') || secret.includes('secret')) {
    throw new ConfigError(`${name} appears to be a default/example value. Please use a secure random string`, name)
  }
  
  return secret
}

const validateEncryptionKey = (key, name) => {
  if (!key || key.length !== 32) {
    throw new ConfigError(`${name} must be exactly 32 characters long`, name)
  }
  
  if (key.includes('your-') || key.includes('example')) {
    throw new ConfigError(`${name} appears to be a default/example value. Please use a secure random string`, name)
  }
  
  return key
}

const validateEmail = (email, name) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    throw new ConfigError(`${name} must be a valid email address`, name)
  }
  return email
}

const validateURL = (url, name) => {
  try {
    new URL(url)
    return url
  } catch (error) {
    throw new ConfigError(`${name} must be a valid URL`, name)
  }
}

const validateCronPattern = (pattern, name) => {
  const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/
  if (!cronRegex.test(pattern)) {
    throw new ConfigError(`${name} must be a valid cron pattern`, name)
  }
  return pattern
}

const generateSecureDefaults = () => {
  return {
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    encryptionKey: crypto.randomBytes(32).toString('hex'),
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    jwtRefreshSecret: crypto.randomBytes(32).toString('hex')
  }
}

const loadConfig = () => {
  try {
    const isDevelopment = process.env.NODE_ENV === 'development'
    const isProduction = process.env.NODE_ENV === 'production'
    const isTest = process.env.NODE_ENV === 'test'
    
    const secureDefaults = isDevelopment ? generateSecureDefaults() : {}
    
    const config = {
      server: {
        port: validateOptional(process.env.PORT, 3000, 'number'),
        host: validateOptional(process.env.HOST, 'localhost'),
        nodeEnv: validateOptional(process.env.NODE_ENV, 'development'),
        apiVersion: validateOptional(process.env.API_VERSION, 'v1'),
        sessionSecret: isProduction 
          ? validateJWTSecret(process.env.SESSION_SECRET, 'SESSION_SECRET')
          : validateOptional(process.env.SESSION_SECRET, secureDefaults.sessionSecret),
        encryptionKey: isProduction
          ? validateEncryptionKey(process.env.ENCRYPTION_KEY, 'ENCRYPTION_KEY')
          : validateOptional(process.env.ENCRYPTION_KEY, secureDefaults.encryptionKey),
        bcryptRounds: validateOptional(process.env.BCRYPT_ROUNDS, 12, 'number')
      },
      
      database: {
        uri: isTest 
          ? validateRequired(process.env.MONGODB_TEST_URI, 'MONGODB_TEST_URI')
          : validateRequired(process.env.MONGODB_URI, 'MONGODB_URI'),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        authSource: validateOptional(process.env.DB_AUTH_SOURCE, 'admin'),
        ssl: validateOptional(process.env.DB_SSL, false, 'boolean'),
        sslCertPath: process.env.DB_SSL_CERT_PATH,
        sslCAPath: process.env.DB_SSL_CA_PATH,
        minPoolSize: validateOptional(process.env.DB_MIN_POOL_SIZE, 5, 'number'),
        maxPoolSize: validateOptional(process.env.DB_MAX_POOL_SIZE, 20, 'number'),
        connectionTimeout: validateOptional(process.env.DB_CONNECTION_TIMEOUT, 30000, 'number'),
        socketTimeout: validateOptional(process.env.DB_SOCKET_TIMEOUT, 30000, 'number'),
        maxRetries: validateOptional(process.env.DB_MAX_RETRIES, 3, 'number'),
        retryDelay: validateOptional(process.env.DB_RETRY_DELAY, 5000, 'number')
      },
      
      jwt: {
        secret: isProduction
          ? validateJWTSecret(process.env.JWT_SECRET, 'JWT_SECRET')
          : validateOptional(process.env.JWT_SECRET, secureDefaults.jwtSecret),
        expiresIn: validateOptional(process.env.JWT_EXPIRE, '7d'),
        refreshSecret: isProduction
          ? validateJWTSecret(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET')
          : validateOptional(process.env.JWT_REFRESH_SECRET, secureDefaults.jwtRefreshSecret),
        refreshExpiresIn: validateOptional(process.env.JWT_REFRESH_EXPIRE, '30d'),
        issuer: validateOptional(process.env.JWT_ISSUER, 'fsns-api'),
        audience: validateOptional(process.env.JWT_AUDIENCE, 'fsns-clients')
      },
      
      email: {
        sendgrid: {
          apiKey: process.env.SENDGRID_API_KEY,
          fromEmail: process.env.SENDGRID_FROM_EMAIL,
          fromName: validateOptional(process.env.SENDGRID_FROM_NAME, 'FSNS Notifications'),
          templates: {
            flightDelay: process.env.SENDGRID_TEMPLATE_FLIGHT_DELAY,
            flightCancellation: process.env.SENDGRID_TEMPLATE_FLIGHT_CANCELLATION,
            gateChange: process.env.SENDGRID_TEMPLATE_GATE_CHANGE,
            boardingCall: process.env.SENDGRID_TEMPLATE_BOARDING_CALL
          }
        },
        smtp: {
          host: validateOptional(process.env.SMTP_HOST, 'smtp.gmail.com'),
          port: validateOptional(process.env.SMTP_PORT, 587, 'number'),
          secure: validateOptional(process.env.SMTP_SECURE, false, 'boolean'),
          user: process.env.SMTP_USER,
          password: process.env.SMTP_PASSWORD,
          tlsRejectUnauthorized: validateOptional(process.env.SMTP_TLS_REJECT_UNAUTHORIZED, true, 'boolean')
        }
      },
      
      redis: {
        url: validateOptional(process.env.REDIS_URL, 'redis://localhost:6379'),
        password: process.env.REDIS_PASSWORD,
        db: validateOptional(process.env.REDIS_DB, 0, 'number'),
        keyPrefix: validateOptional(process.env.REDIS_KEY_PREFIX, 'fsns:'),
        sessionTTL: validateOptional(process.env.REDIS_SESSION_TTL, 86400, 'number'),
        cacheTTL: validateOptional(process.env.REDIS_CACHE_TTL, 3600, 'number')
      },
      
      apis: {
        flight: {
          key: process.env.FLIGHT_API_KEY,
          url: process.env.FLIGHT_API_URL,
          timeout: validateOptional(process.env.FLIGHT_API_TIMEOUT, 10000, 'number'),
          retryAttempts: validateOptional(process.env.FLIGHT_API_RETRY_ATTEMPTS, 3, 'number')
        },
        weather: {
          key: process.env.WEATHER_API_KEY,
          url: process.env.WEATHER_API_URL
        },
        airport: {
          key: process.env.AIRPORT_API_KEY,
          url: process.env.AIRPORT_API_URL
        }
      },
      
      security: {
        rateLimit: {
          windowMs: validateOptional(process.env.RATE_LIMIT_WINDOW_MS, 900000, 'number'),
          maxRequests: validateOptional(process.env.RATE_LIMIT_MAX_REQUESTS, 100, 'number'),
          skipSuccessfulRequests: validateOptional(process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS, false, 'boolean'),
          skipFailedRequests: validateOptional(process.env.RATE_LIMIT_SKIP_FAILED_REQUESTS, false, 'boolean')
        },
        cors: {
          origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
          credentials: validateOptional(process.env.CORS_CREDENTIALS, true, 'boolean'),
          methods: process.env.CORS_METHODS ? process.env.CORS_METHODS.split(',') : ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: process.env.CORS_ALLOWED_HEADERS ? process.env.CORS_ALLOWED_HEADERS.split(',') : ['Content-Type', 'Authorization', 'X-Requested-With']
        },
        csp: {
          reportUri: validateOptional(process.env.CSP_REPORT_URI, '/api/csp-report'),
          reportOnly: validateOptional(process.env.CSP_REPORT_ONLY, false, 'boolean')
        }
      },
      
      logging: {
        level: validateOptional(process.env.LOG_LEVEL, isDevelopment ? 'debug' : 'info'),
        filePath: validateOptional(process.env.LOG_FILE_PATH, 'logs/'),
        maxSize: validateOptional(process.env.LOG_MAX_SIZE, '10m'),
        maxFiles: validateOptional(process.env.LOG_MAX_FILES, 5, 'number'),
        datePattern: validateOptional(process.env.LOG_DATE_PATTERN, 'YYYY-MM-DD')
      },
      
      monitoring: {
        apm: {
          serviceName: validateOptional(process.env.APM_SERVICE_NAME, 'fsns-api'),
          environment: validateOptional(process.env.APM_ENVIRONMENT, process.env.NODE_ENV || 'development'),
          serverUrl: process.env.APM_SERVER_URL
        },
        healthCheck: {
          interval: validateOptional(process.env.HEALTH_CHECK_INTERVAL, 30000, 'number'),
          timeout: validateOptional(process.env.HEALTH_CHECK_TIMEOUT, 5000, 'number')
        }
      },
      
      notifications: {
        twilio: {
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          authToken: process.env.TWILIO_AUTH_TOKEN,
          phoneNumber: process.env.TWILIO_PHONE_NUMBER
        },
        firebase: {
          serverKey: process.env.FIREBASE_SERVER_KEY,
          projectId: process.env.FIREBASE_PROJECT_ID
        },
        timing: {
          delayThreshold: validateOptional(process.env.NOTIFICATION_DELAY_THRESHOLD, 15, 'number'),
          advanceTime: validateOptional(process.env.NOTIFICATION_ADVANCE_TIME, 60, 'number'),
          retryAttempts: validateOptional(process.env.NOTIFICATION_RETRY_ATTEMPTS, 3, 'number'),
          retryDelay: validateOptional(process.env.NOTIFICATION_RETRY_DELAY, 300000, 'number')
        }
      },
      
      cron: {
        flightStatusCheck: validateOptional(process.env.CRON_FLIGHT_STATUS_CHECK, '*/5 * * * *'),
        notificationCleanup: validateOptional(process.env.CRON_NOTIFICATION_CLEANUP, '0 2 * * *'),
        databaseBackup: validateOptional(process.env.CRON_DATABASE_BACKUP, '0 3 * * *'),
        logRotation: validateOptional(process.env.CRON_LOG_ROTATION, '0 1 * * *')
      },
      
      development: {
        debugMode: validateOptional(process.env.DEBUG_MODE, isDevelopment, 'boolean'),
        debugSQL: validateOptional(process.env.DEBUG_SQL, false, 'boolean'),
        debugRoutes: validateOptional(process.env.DEBUG_ROUTES, false, 'boolean'),
        useMocks: {
          flightAPI: validateOptional(process.env.USE_MOCK_FLIGHT_API, isDevelopment, 'boolean'),
          emailService: validateOptional(process.env.USE_MOCK_EMAIL_SERVICE, isDevelopment, 'boolean'),
          smsService: validateOptional(process.env.USE_MOCK_SMS_SERVICE, isDevelopment, 'boolean')
        }
      }
    }
    
    if (isProduction) {
      validateProductionConfig(config)
    }
    
    return config
  } catch (error) {
    if (error instanceof ConfigError) {
      if (process.env.NODE_ENV !== 'test') {
        console.error(`Configuration Error: ${error.message}`)
        console.error(`Variable: ${error.variable}`)
        process.exit(1)
      }
      throw error
    }
    throw error
  }
}

const validateProductionConfig = (config) => {
  const requiredForProduction = [
    'MONGODB_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'SESSION_SECRET',
    'ENCRYPTION_KEY'
  ]
  
  const missingVars = requiredForProduction.filter(varName => {
    const value = process.env[varName]
    return !value || value.includes('your-') || value.includes('example')
  })
  
  if (missingVars.length > 0) {
    throw new ConfigError(
      `Production environment requires secure values for: ${missingVars.join(', ')}`,
      missingVars[0]
    )
  }
  
  if (config.server.port === 3000) {
    console.warn('Warning: Using default port 3000 in production')
  }
  
  if (config.security.cors.origin.includes('localhost')) {
    console.warn('Warning: CORS origin includes localhost in production')
  }
}

module.exports = {
  config: loadConfig(),
  ConfigError,
  validateRequired,
  validateOptional,
  validateJWTSecret,
  validateEmail,
  validateURL
}