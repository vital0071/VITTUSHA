export class ApiError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function sendError(res, error) {
  const status = error.status && Number.isInteger(error.status) ? error.status : 500;
  const code = error.code ?? 'internal_error';
  const message = status >= 500 && !error.expose ? 'Internal server error.' : error.message;
  res.status(status).json({
    ok: false,
    error: {
      code,
      message,
      details: error.details ?? {}
    }
  });
}
