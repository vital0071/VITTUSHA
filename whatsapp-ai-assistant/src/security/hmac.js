import crypto from 'node:crypto';
import { config } from '../config.js';

export class HmacAuthError extends Error {
  constructor(code, message, status = 401, details = {}) {
    super(message);
    this.name = 'HmacAuthError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function buildSignatureBase({ timestamp, method, path, rawBody = '' }) {
  return `${timestamp}.${String(method).toUpperCase()}.${path}.${rawBody}`;
}

export function signRequest({ timestamp, method, path, rawBody = '', secret }) {
  return crypto
    .createHmac('sha256', secret)
    .update(buildSignatureBase({ timestamp, method, path, rawBody }))
    .digest('hex');
}

export function verifyHmacRequest(req, options = {}) {
  const apiKeyId = options.apiKeyId ?? config.wordpress.apiKeyId;
  const secret = options.secret ?? config.wordpress.hmacSecret;
  const maxSkewSeconds = options.maxSkewSeconds ?? config.wordpress.hmacMaxSkewSeconds;

  if (!apiKeyId || !secret) {
    throw new HmacAuthError('hmac_not_configured', 'HMAC authentication is not configured.', 500);
  }

  const key = req.get('x-vittusha-key');
  const timestamp = req.get('x-vittusha-timestamp');
  const signature = req.get('x-vittusha-signature');

  if (!key || !timestamp || !signature) {
    throw new HmacAuthError('missing_hmac_headers', 'Missing HMAC authentication headers.', 401);
  }

  if (key !== apiKeyId) {
    throw new HmacAuthError('invalid_api_key', 'API key is invalid.', 401);
  }

  const timestampNumber = Number(timestamp);
  if (!Number.isInteger(timestampNumber)) {
    throw new HmacAuthError('invalid_timestamp', 'Timestamp is invalid.', 401);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampNumber) > maxSkewSeconds) {
    throw new HmacAuthError('stale_timestamp', 'Timestamp is outside the allowed clock window.', 401);
  }

  const path = req.originalUrl || req.url;
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : '';
  const expected = signRequest({ timestamp, method: req.method, path, rawBody, secret });

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new HmacAuthError('invalid_signature', 'Request signature is invalid.', 401);
  }

  return true;
}

export function requireHmac(options = {}) {
  return (req, res, next) => {
    try {
      verifyHmacRequest(req, options);
      next();
    } catch (error) {
      next(error);
    }
  };
}
