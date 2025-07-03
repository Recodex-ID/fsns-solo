process.env.NODE_ENV = 'test'
process.env.MONGODB_URI = 'mongodb://localhost:27017/fsns-test'
process.env.MONGODB_TEST_URI = 'mongodb://localhost:27017/fsns-test'
process.env.JWT_SECRET = 'test-jwt-secret-key-minimum-32-characters'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-minimum-32-characters'
process.env.SESSION_SECRET = 'test-session-secret-key-minimum-32-characters'
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters'
process.env.PORT = '3001'

jest.setTimeout(30000)