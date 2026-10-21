// An error the caller is allowed to see. The handler shell (utils/defineHandler.ts) answers it as
// { error: { code, message, details } } with its status; any other error becomes a 500 with a reference instead.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Missing or invalid API key') => new HttpError(401, 'unauthorized', message);
export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: unknown) => new HttpError(409, 'conflict', message, details);
// DynamoDB kept refusing a transaction because other requests were writing the same items. Retrying shortly works.
export const busy = (message: string) => new HttpError(503, 'busy', message);
