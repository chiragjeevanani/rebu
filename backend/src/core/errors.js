// Throw these from anywhere; the error middleware turns them into JSON.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message, details) => new ApiError(400, 'bad_request', message, details)
export const unauthorized = (message = 'Please sign in again.') => new ApiError(401, 'unauthorized', message)
export const forbidden = (message = 'You don’t have access to this.') => new ApiError(403, 'forbidden', message)
export const notFound = (what = 'Resource') => new ApiError(404, 'not_found', `${what} not found.`)
export const conflict = (message, code = 'conflict') => new ApiError(409, code, message)
export const insufficientCoins = (needed, balance) =>
  new ApiError(402, 'insufficient_coins', 'Not enough coins.', { needed, balance })
