'use strict';

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, 'bad_request', message, details);
const unauthorized = (message = 'Missing or invalid API key') => new HttpError(401, 'unauthorized', message);
const notFound = (what) => new HttpError(404, 'not_found', `${what} not found`);
const conflict = (message, details) => new HttpError(409, 'conflict', message, details);

function errorHandler(logger) {
  // Express recognizes error handlers by their four arguments.
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    logger.error('Unhandled error', err);
    return res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
  };
}

module.exports = { HttpError, badRequest, unauthorized, notFound, conflict, errorHandler };
