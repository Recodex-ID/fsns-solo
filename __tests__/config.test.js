const { ConfigError, validateRequired, validateOptional, validateJWTSecret, validateEmail, validateURL } = require('../src/config/config')

describe('Configuration Validation', () => {
  describe('validateRequired', () => {
    it('should validate required string values', () => {
      expect(validateRequired('test-value', 'TEST_VAR')).toBe('test-value')
      expect(() => validateRequired('', 'TEST_VAR')).toThrow(ConfigError)
      expect(() => validateRequired(undefined, 'TEST_VAR')).toThrow(ConfigError)
      expect(() => validateRequired(null, 'TEST_VAR')).toThrow(ConfigError)
    })

    it('should validate required number values', () => {
      expect(validateRequired('123', 'TEST_VAR', 'number')).toBe(123)
      expect(validateRequired(123, 'TEST_VAR', 'number')).toBe(123)
      expect(() => validateRequired('invalid', 'TEST_VAR', 'number')).toThrow(ConfigError)
    })

    it('should validate required boolean values', () => {
      expect(validateRequired('true', 'TEST_VAR', 'boolean')).toBe(true)
      expect(validateRequired('false', 'TEST_VAR', 'boolean')).toBe(false)
      expect(validateRequired(true, 'TEST_VAR', 'boolean')).toBe(true)
      expect(validateRequired(false, 'TEST_VAR', 'boolean')).toBe(false)
    })
  })

  describe('validateOptional', () => {
    it('should return default value for empty optional values', () => {
      expect(validateOptional('', 'default')).toBe('default')
      expect(validateOptional(undefined, 'default')).toBe('default')
      expect(validateOptional(null, 'default')).toBe('default')
    })

    it('should return provided value for non-empty optional values', () => {
      expect(validateOptional('test', 'default')).toBe('test')
      expect(validateOptional('123', 456, 'number')).toBe(123)
      expect(validateOptional('true', false, 'boolean')).toBe(true)
    })
  })

  describe('validateJWTSecret', () => {
    it('should validate secure JWT secrets', () => {
      const secureSecret = 'a'.repeat(32)
      expect(validateJWTSecret(secureSecret, 'JWT_SECRET')).toBe(secureSecret)
    })

    it('should reject short JWT secrets', () => {
      expect(() => validateJWTSecret('short', 'JWT_SECRET')).toThrow(ConfigError)
    })

    it('should reject default/example JWT secrets', () => {
      expect(() => validateJWTSecret('your-secret-key', 'JWT_SECRET')).toThrow(ConfigError)
      expect(() => validateJWTSecret('example-secret', 'JWT_SECRET')).toThrow(ConfigError)
    })
  })

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('test@example.com', 'EMAIL')).toBe('test@example.com')
      expect(validateEmail('user.name@domain.co.uk', 'EMAIL')).toBe('user.name@domain.co.uk')
    })

    it('should reject invalid email addresses', () => {
      expect(() => validateEmail('invalid-email', 'EMAIL')).toThrow(ConfigError)
      expect(() => validateEmail('test@', 'EMAIL')).toThrow(ConfigError)
      expect(() => validateEmail('@example.com', 'EMAIL')).toThrow(ConfigError)
    })
  })

  describe('validateURL', () => {
    it('should validate correct URLs', () => {
      expect(validateURL('https://example.com', 'URL')).toBe('https://example.com')
      expect(validateURL('http://localhost:3000', 'URL')).toBe('http://localhost:3000')
    })

    it('should reject invalid URLs', () => {
      expect(() => validateURL('invalid-url', 'URL')).toThrow(ConfigError)
      expect(() => validateURL('not-a-url', 'URL')).toThrow(ConfigError)
    })
  })

  describe('ConfigError', () => {
    it('should create ConfigError with message and variable', () => {
      const error = new ConfigError('Test error message', 'TEST_VAR')
      expect(error.message).toBe('Test error message')
      expect(error.variable).toBe('TEST_VAR')
      expect(error.name).toBe('ConfigError')
    })
  })
})

describe('Environment Configuration Loading', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should load configuration with default values in development', () => {
    process.env.NODE_ENV = 'development'
    process.env.MONGODB_URI = 'mongodb://localhost:27017/fsns-dev'
    
    const { config } = require('../src/config/config')
    
    expect(config.server.port).toBe(3000)
    expect(config.server.nodeEnv).toBe('development')
    expect(config.database.maxRetries).toBe(3)
    expect(config.logging.level).toBe('debug')
    expect(config.development.debugMode).toBe(true)
  })

  it('should handle missing database URI in production', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.MONGODB_URI
    
    expect(() => {
      delete require.cache[require.resolve('../src/config/config')]
      require('../src/config/config')
    }).toThrow(ConfigError)
  })

  it('should handle missing JWT secret in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.MONGODB_URI = 'mongodb://localhost:27017/fsns-prod'
    delete process.env.JWT_SECRET
    
    expect(() => {
      delete require.cache[require.resolve('../src/config/config')]
      require('../src/config/config')
    }).toThrow()
  })
})