import test from 'node:test';
import assert from 'node:assert/strict';

process.env.WORDPRESS_API_KEY_ID = 'wp_test';
process.env.WORDPRESS_HMAC_SECRET = 'test_secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.OPENAI_API_KEY = 'test';
process.env.TELEGRAM_BOT_TOKEN = 'test';
process.env.TELEGRAM_ALLOWED_CHAT_ID = '123';

const { createApp } = await import('../src/app.js');
const { signRequest, verifyHmacRequest } = await import('../src/security/hmac.js');
const { hashTelegramLinkCode, looksLikeTelegramLinkCode } = await import('../src/users/user-service.js');

function signedHeaders({ method, path, body = '' }) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-vittusha-key': 'wp_test',
    'x-vittusha-timestamp': timestamp,
    'x-vittusha-signature': signRequest({ timestamp, method, path, rawBody: body, secret: 'test_secret' })
  };
}

async function withServer(app, callback) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('valid HMAC request verifies', () => {
  const body = '{"ok":true}';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signRequest({ timestamp, method: 'POST', path: '/v1/test', rawBody: body, secret: 'test_secret' });
  const req = {
    method: 'POST',
    originalUrl: '/v1/test',
    rawBody: body,
    get(name) {
      return {
        'x-vittusha-key': 'wp_test',
        'x-vittusha-timestamp': timestamp,
        'x-vittusha-signature': signature
      }[name.toLowerCase()];
    }
  };

  assert.equal(verifyHmacRequest(req, { apiKeyId: 'wp_test', secret: 'test_secret', maxSkewSeconds: 300 }), true);
});

test('invalid signature is rejected', () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const req = {
    method: 'POST',
    originalUrl: '/v1/test',
    rawBody: '{}',
    get(name) {
      return {
        'x-vittusha-key': 'wp_test',
        'x-vittusha-timestamp': timestamp,
        'x-vittusha-signature': '00'.repeat(32)
      }[name.toLowerCase()];
    }
  };

  assert.throws(() => verifyHmacRequest(req, { apiKeyId: 'wp_test', secret: 'test_secret', maxSkewSeconds: 300 }), /signature/i);
});

test('stale timestamp is rejected', () => {
  const req = {
    method: 'GET',
    originalUrl: '/v1/test',
    rawBody: '',
    get(name) {
      return {
        'x-vittusha-key': 'wp_test',
        'x-vittusha-timestamp': '1000',
        'x-vittusha-signature': '00'.repeat(32)
      }[name.toLowerCase()];
    }
  };

  assert.throws(() => verifyHmacRequest(req, { apiKeyId: 'wp_test', secret: 'test_secret', maxSkewSeconds: 300 }), /Timestamp/);
});

test('API implements user creation and idempotent user sync contract', async () => {
  let calls = 0;
  const app = createApp({
    v1Dependencies: {
      syncWordPressUser: async (body) => {
        calls += 1;
        assert.equal(body.vittusha_user_id, 'vit_abc');
        return { backend_user_id: 'usr_abc', vittusha_user_id: body.vittusha_user_id, synced: true };
      }
    }
  });

  await withServer(app, async (baseUrl) => {
    const body = JSON.stringify({ wordpress_user_id: 123, vittusha_user_id: 'vit_abc', current_plan: 'starter', subscription_status: 'pending' });
    for (let i = 0; i < 2; i += 1) {
      const res = await fetch(`${baseUrl}/v1/users/sync`, {
        method: 'POST',
        headers: signedHeaders({ method: 'POST', path: '/v1/users/sync', body }),
        body
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, backend_user_id: 'usr_abc', vittusha_user_id: 'vit_abc', synced: true });
    }
  });

  assert.equal(calls, 2);
});

test('API implements subscription sync, link-code creation, and connection status responses', async () => {
  const app = createApp({
    v1Dependencies: {
      syncSubscription: async (body) => ({ vittusha_user_id: body.vittusha_user_id, plan: body.plan, subscription_status: body.subscription_status }),
      registerTelegramLinkCode: async (body) => ({ status: 'pending', expires_at: body.expires_at }),
      getConnections: async () => ({
        telegram: { connected: true, telegram_chat_id: '123', telegram_username: 'vital', connected_at: '2026-07-06T21:10:00.000Z' },
        email: { connected: false, provider: null, connected_at: null },
        calendar: { connected: false, provider: null, connected_at: null }
      })
    }
  });

  await withServer(app, async (baseUrl) => {
    const subBody = JSON.stringify({ vittusha_user_id: 'vit_abc', plan: 'pro', subscription_status: 'pending' });
    const sub = await fetch(`${baseUrl}/v1/subscriptions/sync`, {
      method: 'POST',
      headers: signedHeaders({ method: 'POST', path: '/v1/subscriptions/sync', body: subBody }),
      body: subBody
    });
    assert.equal(sub.status, 200);
    assert.equal((await sub.json()).plan, 'pro');

    const linkBody = JSON.stringify({ wordpress_user_id: 123, vittusha_user_id: 'vit_abc', link_code: 'A'.repeat(32), expires_at: '2026-07-06T21:32:00+00:00' });
    const link = await fetch(`${baseUrl}/v1/telegram/link-codes`, {
      method: 'POST',
      headers: signedHeaders({ method: 'POST', path: '/v1/telegram/link-codes', body: linkBody }),
      body: linkBody
    });
    assert.equal(link.status, 200);
    assert.equal((await link.json()).status, 'pending');

    const connections = await fetch(`${baseUrl}/v1/users/vit_abc/connections`, {
      headers: signedHeaders({ method: 'GET', path: '/v1/users/vit_abc/connections' })
    });
    assert.equal(connections.status, 200);
    assert.equal((await connections.json()).connections.telegram.connected, true);
  });
});

test('link code hashing is deterministic and does not expose the raw code', () => {
  const code = 'A'.repeat(32);
  assert.equal(looksLikeTelegramLinkCode(code), true);
  const hash = hashTelegramLinkCode(code, 'secret');
  assert.equal(hash, hashTelegramLinkCode(code, 'secret'));
  assert.notEqual(hash, code);
  assert.match(hash, /^[a-f0-9]{64}$/);
});
