class FlightError extends Error {
  constructor(message, code = 'FLIGHT_ERROR', statusCode = 500, details = null) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.statusCode = statusCode
    this.details = details
    this.timestamp = new Date().toISOString()
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    }
  }
}

class FlightNotFoundError extends FlightError {
  constructor(flightNumber, details = null) {
    super(
      `Flight ${flightNumber} not found`,
      'FLIGHT_NOT_FOUND',
      404,
      details
    )
    this.flightNumber = flightNumber
  }
}

class FlightValidationError extends FlightError {
  constructor(message, field = null, value = null, details = null) {
    super(
      message,
      'FLIGHT_VALIDATION_ERROR',
      400,
      details
    )
    this.field = field
    this.value = value
  }
}

class FlightConflictError extends FlightError {
  constructor(message, conflictType = 'GENERAL', details = null) {
    super(
      message,
      'FLIGHT_CONFLICT_ERROR',
      409,
      details
    )
    this.conflictType = conflictType
  }
}

class FlightOperationError extends FlightError {
  constructor(message, operation = null, details = null) {
    super(
      message,
      'FLIGHT_OPERATION_ERROR',
      500,
      details
    )
    this.operation = operation
  }
}

class FlightStatusError extends FlightError {
  constructor(message, currentStatus = null, requestedStatus = null, details = null) {
    super(
      message,
      'FLIGHT_STATUS_ERROR',
      400,
      details
    )
    this.currentStatus = currentStatus
    this.requestedStatus = requestedStatus
  }
}

class FlightScheduleError extends FlightError {
  constructor(message, scheduleType = null, details = null) {
    super(
      message,
      'FLIGHT_SCHEDULE_ERROR',
      400,
      details
    )
    this.scheduleType = scheduleType
  }
}

class FlightDatabaseError extends FlightError {
  constructor(message, operation = null, details = null) {
    super(
      message,
      'FLIGHT_DATABASE_ERROR',
      500,
      details
    )
    this.operation = operation
  }
}

class FlightAuthorizationError extends FlightError {
  constructor(message, requiredRole = null, userRole = null, details = null) {
    super(
      message,
      'FLIGHT_AUTHORIZATION_ERROR',
      403,
      details
    )
    this.requiredRole = requiredRole
    this.userRole = userRole
  }
}

class FlightRateLimitError extends FlightError {
  constructor(message, retryAfter = null, details = null) {
    super(
      message,
      'FLIGHT_RATE_LIMIT_ERROR',
      429,
      details
    )
    this.retryAfter = retryAfter
  }
}

class FlightExternalAPIError extends FlightError {
  constructor(message, apiName = null, apiStatus = null, details = null) {
    super(
      message,
      'FLIGHT_EXTERNAL_API_ERROR',
      503,
      details
    )
    this.apiName = apiName
    this.apiStatus = apiStatus
  }
}

module.exports = {
  FlightError,
  FlightNotFoundError,
  FlightValidationError,
  FlightConflictError,
  FlightOperationError,
  FlightStatusError,
  FlightScheduleError,
  FlightDatabaseError,
  FlightAuthorizationError,
  FlightRateLimitError,
  FlightExternalAPIError
}