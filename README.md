# Flight Status Notification System (FSNS)

A comprehensive backend system for real-time flight status notifications designed for the aviation industry.

## Features

- **Real-time Flight Tracking**: Monitor flight status updates in real-time
- **Multi-channel Notifications**: Email, SMS, and push notifications
- **RESTful API**: Complete API for flight operations and passenger management
- **Admin Dashboard**: Authentication and management interface for administrators
- **WebSocket Support**: Real-time updates via Socket.IO
- **Robust Error Handling**: Comprehensive error handling and logging
- **Rate Limiting**: API rate limiting for security and performance
- **Email Templates**: Professional email notifications for passengers

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database with Mongoose ODM
- **Socket.IO** - Real-time bidirectional communication
- **JWT** - Authentication and authorization
- **Nodemailer** - Email notifications
- **Winston** - Logging
- **Jest** - Testing framework

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB
- Redis (optional, for caching)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Recodex-ID/fsns-backend.git
cd fsns-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the development server:
```bash
npm run dev
```

### Environment Variables

Create a `.env` file based on `.env.example`:

- `PORT` - Server port (default: 3000)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `SMTP_*` - Email configuration
- `REDIS_URL` - Redis connection string (optional)

## API Endpoints

### Health Check
- `GET /` - API information
- `GET /health` - Health check endpoint

### Flight Operations
- `GET /api/flights` - Get all flights
- `GET /api/flights/:id` - Get flight by ID
- `POST /api/flights` - Create new flight (admin only)
- `PUT /api/flights/:id` - Update flight (admin only)
- `DELETE /api/flights/:id` - Delete flight (admin only)

### Passenger Management
- `GET /api/passengers` - Get all passengers
- `GET /api/passengers/:id` - Get passenger by ID
- `POST /api/passengers` - Register new passenger
- `PUT /api/passengers/:id` - Update passenger information

### Admin Authentication
- `POST /api/auth/login` - Admin login
- `POST /api/auth/register` - Admin registration
- `GET /api/auth/profile` - Get admin profile

### Notifications
- `GET /api/notifications` - Get notifications
- `POST /api/notifications/send` - Send notification (admin only)

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

## Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── middleware/      # Custom middleware
├── models/         # Database models
├── routes/         # API routes
├── services/       # Business logic
├── utils/          # Utility functions
└── server.js       # Main server file
```

## Testing

Run tests with:
```bash
npm test
```

For watch mode:
```bash
npm run test:watch
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.