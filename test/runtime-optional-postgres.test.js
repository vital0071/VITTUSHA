import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createApp } from '../src/app.js';
import { isDatabaseEnabled, query } from '../src/db.js';

test('app health route works when PostgreSQL is not configured', async () => {
  const app = createApp({
    logger: {
      info() {},
      warn() {},
      error() {}
    }
  });

  const response = await get(app, '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true });
});

test('PostgreSQL is dormant when DATABASE_URL is missing', async () => {
  if (process.env.DATABASE_URL) {
    return;
  }

  assert.equal(isDatabaseEnabled(), false);
  await assert.rejects(
    () => query('SELECT 1'),
    /PostgreSQL is disabled because DATABASE_URL is not configured/
  );
});

async function get(app, path) {
  const req = Readable.from([]);
  req.method = 'GET';
  req.url = path;
  req.headers = {};

  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      setHeader(name, value) {
        this.headers[String(name).toLowerCase()] = value;
      },
      getHeader(name) {
        return this.headers[String(name).toLowerCase()];
      },
      removeHeader(name) {
        delete this.headers[String(name).toLowerCase()];
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(payload = '') {
        this.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
        resolve({ status: this.statusCode, body: this.body, headers: this.headers });
      },
      json(payload) {
        this.setHeader('content-type', 'application/json');
        this.send(JSON.stringify(payload));
      },
      end(chunk) {
        if (chunk) {
          this.body += String(chunk);
        }
        resolve({ status: this.statusCode, body: this.body, headers: this.headers });
      }
    };

    app.handle(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ status: 404, body: '', headers: res.headers });
    });
  });
}
