export class ApiError extends Error {
  constructor(status, message, code = undefined, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details = undefined) {
  return new ApiError(400, message, 'VALIDATION_ERROR', details);
}

export function notFound(message, code = 'NOT_FOUND') {
  return new ApiError(404, message, code);
}

export function unauthorized(message = 'Authentication required') {
  return new ApiError(401, message, 'UNAUTHORIZED');
}

export function forbidden(message = 'You do not have permission to perform this action') {
  return new ApiError(403, message, 'FORBIDDEN');
}

export function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}
