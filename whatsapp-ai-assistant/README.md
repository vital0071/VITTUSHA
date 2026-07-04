# Private Telegram AI Assistant MVP

Node.js + Express AI assistant that receives Telegram bot messages, routes them into AI Core, replies through Telegram, and stores conversations, memories, tasks, and suggestions in PostgreSQL or Supabase.

WhatsApp remains as an optional channel module, but Telegram is now the first MVP channel. The app starts without Meta WhatsApp credentials.

## Features

- Telegram Bot API webhook at `POST /webhook/telegram`.
- Telegram allowlist with `TELEGRAM_ALLOWED_CHAT_ID`.
- OpenAI Responses API integration.
- Channel-based architecture with Telegram and optional WhatsApp modules.
- AI Core that receives message, user id, channel, language, and chat/conversation context.
- Memory system for long-term user facts.
- Task planner for approval-gated actions.
- Placeholder tool registry for Gmail, Google Maps, HubSpot, browser, and calendar.
- Proactive assistant with suggestions and opt-in daily Telegram check-in.
- Haitian Creole first, with French and English support.
- Editable system prompt in `src/prompts/system-prompt.md`.

The assistant may suggest actions, but it must not send emails, contact leads, update CRM, schedule meetings, publish content, or perform external actions without explicit approval.

## Project Structure

```text
src/
  app.js                    Express routes
  server.js                 Runtime entrypoint
  config.js                 Environment configuration
  db.js                     PostgreSQL connection pool
  ai-core/
    agent.js                Central AI Core message processor
    openai-client.js        OpenAI API call and prompt assembly
  channels/
    telegram.js             Telegram send/receive/routing boundary
    whatsapp.js             Optional WhatsApp send/receive/routing boundary
  memory/
    memory-store.js         Long-term memory persistence
  prompts/system-prompt.md  Editable assistant behavior prompt
  proactive-engine.js       Pending work analysis and daily summaries
  scheduler/checkin.js      Optional daily proactive check-in scheduler
  services/
    conversations.js        Conversation database writes
    language.js             Language detection helper
  suggestions.js            Suggestion lifecycle persistence
  tasks/
    task-planner.js         Approval-gated task creation
  tools/
    registry.js             Placeholder tool registry
sql/schema.sql              Database schema
sql/migrations/             Incremental database migrations
test/                       Unit tests
.env.example                Environment template
```

## Required Environment

Required for the Telegram MVP:

```env
OPENAI_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_CHAT_ID=
DATABASE_URL=
```

Recommended/optional:

```env
NODE_ENV=development
PORT=3000
OPENAI_MODEL=gpt-4.1-mini
OPENAI_MAX_OUTPUT_TOKENS=700
PGSSL=false
ENABLE_PROACTIVE_CHECKIN=false
PROACTIVE_CHECKIN_TIME=08:00
```

Optional WhatsApp variables, not required for startup:

```env
META_VERIFY_TOKEN=
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_GRAPH_API_VERSION=v21.0
APPROVED_PHONE_NUMBER=
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Fill in the required Telegram, OpenAI, and database values.

4. Create the database tables:

```bash
psql "$DATABASE_URL" -f sql/schema.sql
```

For Supabase, paste `sql/schema.sql` into the Supabase SQL editor.

If updating an older MVP database, apply migrations:

```bash
psql "$DATABASE_URL" -f sql/migrations/001_agent_architecture.sql
psql "$DATABASE_URL" -f sql/migrations/002_phase_5_light_suggestions.sql
```

5. Start the server:

```bash
npm run dev
```

Production:

```bash
npm start
```

## Create A Telegram Bot

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`.
3. Choose a display name.
4. Choose a bot username ending in `bot`.
5. BotFather will give you a bot token.
6. Put that token in `.env`:

```env
TELEGRAM_BOT_TOKEN=123456789:your-token-here
```

## Get Your Telegram Chat ID

Simple method:

1. Send any message to your new bot in Telegram.
2. Visit this URL in your browser, replacing the token:

```text
https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```

3. Find `message.chat.id` in the JSON response.
4. Put it in `.env`:

```env
TELEGRAM_ALLOWED_CHAT_ID=123456789
```

Only this chat id is accepted. Other chats are ignored or receive `Unauthorized`.

## Set The Telegram Webhook

Telegram requires a public HTTPS URL.

Local tunnel example:

```bash
ngrok http 3000
```

Set the webhook:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://your-public-url.example/webhook/telegram"
```

Check webhook status:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

Delete webhook if needed:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
```

## Local Testing

1. Run the app:

```bash
npm run dev
```

2. Start a tunnel:

```bash
ngrok http 3000
```

3. Set the Telegram webhook to the tunnel URL:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://your-ngrok-url.ngrok-free.app/webhook/telegram"
```

4. Send your bot a message from the allowed Telegram chat.

Useful commands:

- `Kisa m dwe fè jodi a?`
- `Montre m suggestions yo`
- `Apwouve suggestion 1`
- `Ignore suggestion 1`
- `Complete suggestion 1`

## VPS Deployment

1. Copy the project to the VPS.
2. Install Node.js 20+.
3. Run `npm install`.
4. Create `.env` with production values.
5. Apply `sql/schema.sql` to PostgreSQL or Supabase.
6. Run behind HTTPS using Nginx, Caddy, or your platform's managed HTTPS.
7. Start with a process manager such as `pm2` or systemd.
8. Set the webhook:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook?url=https://your-domain.com/webhook/telegram"
```

## Endpoints

- `GET /health`: health check.
- `POST /webhook/telegram`: Telegram webhook.
- `GET /webhook/whatsapp`: optional Meta webhook verification.
- `POST /webhook/whatsapp`: optional WhatsApp webhook.

## Agent Architecture

Telegram is only a communication channel. It parses incoming text, checks the approved chat id, stores the conversation shell, calls AI Core, sends the returned reply, and updates the conversation record.

AI Core is the brain. For Telegram it receives:

- `message`
- `userPhone` containing the chat id for compatibility with existing memory/task tables
- `userId`
- `channel = telegram`
- `language`
- `conversationId`
- `chatId`

It returns:

- `replyText`
- `language`
- `channel`
- `userPhone`
- `userId`
- `toolNeeded`
- `taskId`
- `requiresApproval`
- `metadata`

Memory, tasks, suggestions, proactive planning, and tools stay outside the channel modules.

## Proactive Assistant

The proactive engine analyzes:

- pending tasks
- tasks blocked for more than 3 days
- unapproved tasks
- pending suggestions
- recent conversations

Daily proactive check-in is disabled by default. To enable Telegram check-ins:

```env
ENABLE_PROACTIVE_CHECKIN=true
PROACTIVE_CHECKIN_TIME=08:00
TELEGRAM_BOT_TOKEN=123456789:your-token-here
TELEGRAM_ALLOWED_CHAT_ID=123456789
```

When enabled, the server sends the daily summary through Telegram to `TELEGRAM_ALLOWED_CHAT_ID`. The summary is advisory only and performs no external actions.

## Verification

Run syntax checks and unit tests:

```bash
npm run check
npm test
```
