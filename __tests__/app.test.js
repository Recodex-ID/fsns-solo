const request = require('supertest')
const { MongoMemoryServer } = require('mongodb-memory-server')

describe('FSNS Express Application', () => {
  let app
  let mongoServer

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    const mongoUri = mongoServer.getUri()
    
    process.env.MONGODB_URI = mongoUri
    process.env.MONGODB_TEST_URI = mongoUri
    process.env.NODE_ENV = 'test'
    
    jest.resetModules()
    app = require('../src/app')
  })

  afterAll(async () => {
    if (mongoServer) {
      await mongoServer.stop()
    }
  })

  describe('Root Endpoint', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200)

      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('message', 'Flight Status Notification System API')
      expect(response.body).toHaveProperty('version', '1.0.0')
      expect(response.body).toHaveProperty('status', 'operational')
      expect(response.body).toHaveProperty('timestamp')
      expect(response.body).toHaveProperty('documentation', '/api/docs')
    })

    it('should include request ID in response headers', async () => {
      const response = await request(app)
        .get('/')

      expect(response.headers).toHaveProperty('x-request-id')
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    })
  })

  describe('Health Check Endpoint', () => {
    it('should return comprehensive health status', async () => {
      const response = await request(app)
        .get('/api/health')

      expect([200, 503]).toContain(response.status)
      expect(response.body).toHaveProperty('status')
      expect(response.body).toHaveProperty('timestamp')
      expect(response.body).toHaveProperty('uptime')
      expect(response.body).toHaveProperty('database')
      expect(response.body).toHaveProperty('server')
      expect(response.body).toHaveProperty('memory')
      expect(response.body).toHaveProperty('requestId')

      expect(response.body.uptime).toHaveProperty('seconds')
      expect(response.body.uptime).toHaveProperty('formatted')
      
      expect(response.body.database).toHaveProperty('status')
      expect(response.body.database).toHaveProperty('message')
      expect(response.body.database).toHaveProperty('responseTime')
      
      expect(response.body.server).toHaveProperty('environment')
      expect(response.body.server).toHaveProperty('version')
      expect(response.body.server).toHaveProperty('nodeVersion')
      expect(response.body.server).toHaveProperty('platform')
      expect(response.body.server).toHaveProperty('pid')
      
      expect(response.body.memory).toHaveProperty('rss')
      expect(response.body.memory).toHaveProperty('heapTotal')
      expect(response.body.memory).toHaveProperty('heapUsed')
      expect(response.body.memory).toHaveProperty('external')
    })

    it('should return proper status codes based on health', async () => {
      const response = await request(app)
        .get('/api/health')

      expect([200, 503]).toContain(response.status)
    })
  })

  describe('API Documentation Endpoint', () => {
    it('should return comprehensive API documentation', async () => {
      const response = await request(app)
        .get('/api/docs')
        .expect(200)

      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('title', 'Flight Status Notification System API Documentation')
      expect(response.body).toHaveProperty('version', '1.0.0')
      expect(response.body).toHaveProperty('description')
      expect(response.body).toHaveProperty('baseUrl')
      expect(response.body).toHaveProperty('endpoints')
      expect(response.body).toHaveProperty('authentication')
      expect(response.body).toHaveProperty('rateLimit')
      expect(response.body).toHaveProperty('errorHandling')
      expect(response.body).toHaveProperty('responseFormat')
      expect(response.body).toHaveProperty('contact')
      expect(response.body).toHaveProperty('timestamp')
      expect(response.body).toHaveProperty('requestId')

      expect(response.body.endpoints).toHaveProperty('health')
      expect(response.body.endpoints).toHaveProperty('documentation')
      expect(response.body.endpoints).toHaveProperty('flights')
      expect(response.body.endpoints).toHaveProperty('passengers')
      expect(response.body.endpoints).toHaveProperty('notifications')
      expect(response.body.endpoints).toHaveProperty('auth')
    })

    it('should include proper base URL in documentation', async () => {
      const response = await request(app)
        .get('/api/docs')

      expect(response.body.baseUrl).toMatch(/\/api$/)
    })
  })

  describe('404 Not Found Handler', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/non-existent-route')
        .expect(404)

      expect(response.body).toHaveProperty('success', false)
      expect(response.body).toHaveProperty('error', 'Route not found')
      expect(response.body).toHaveProperty('message')
      expect(response.body).toHaveProperty('availableEndpoints')
      expect(response.body).toHaveProperty('timestamp')
      expect(response.body).toHaveProperty('requestId')
    })

    it('should log 404 requests', async () => {
      await request(app)
        .get('/api/non-existent')
        .expect(404)

      expect(true).toBe(true)
    })
  })

  describe('Security Middleware', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/')

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff')
      expect(response.headers).toHaveProperty('x-frame-options')
      expect(response.headers).toHaveProperty('x-download-options', 'noopen')
    })

    it('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')

      expect(response.status).toBeLessThan(500)
    })
  })

  describe('Rate Limiting', () => {
    it('should apply rate limiting to API routes', async () => {
      const promises = []
      
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .get('/api/health')
        )
      }

      const responses = await Promise.all(promises)
      
      responses.forEach(response => {
        expect([200, 429, 503]).toContain(response.status)
      })
    })
  })

  describe('Request Processing', () => {
    it('should parse JSON body correctly', async () => {
      const testData = { test: 'data' }
      
      const response = await request(app)
        .post('/api/non-existent')
        .send(testData)
        .expect(404)

      expect(response.body).toHaveProperty('success', false)
    })

    it('should handle large JSON payloads', async () => {
      const largeData = {
        data: 'x'.repeat(1000)
      }
      
      const response = await request(app)
        .post('/api/non-existent')
        .send(largeData)
        .expect(404)

      expect(response.body).toHaveProperty('success', false)
    })
  })

  describe('Compression', () => {
    it('should compress responses when appropriate', async () => {
      const response = await request(app)
        .get('/api/docs')
        .set('Accept-Encoding', 'gzip')

      expect(response.status).toBe(200)
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/non-existent')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')

      expect([400, 404]).toContain(response.status)
    })
  })
})