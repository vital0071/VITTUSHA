# Private WhatsApp AI Assistant MVP

Simple Node.js + Express service that receives WhatsApp Cloud API messages, routes them into an AI Core, replies on WhatsApp, and stores conversations, memories, and approval-gated tasks in PostgreSQL or Supabase.

## Features

- Meta WhatsApp Cloud API webhook verification.
- Incoming WhatsApp text message handling.
- Private phone allowlist with `APPROVED_PHONE_NUMBER`.
- OpenAI Responses API integration.
- AI Core that receives message, user phone, channel, and language, then returns a structured response.
- WhatsApp channel layer for send/receive only.
- Memory system for long-term user facts.
- Task planner for approval-gated actions.
- Placeholder tool registry for Gmail, Google Maps, HubSpot, browser, and calendar.
- Phase 5 Light proactive assistant with suggestions and opt-in daily check-in.
- Automatic language detection with priority: Haitian Creole, French, English.
- Replies in the user's detected or dominant language, defaulting to Haitian Creole.
- Editable system prompt in `src/prompts/system-prompt.md`.
- PostgreSQL/Supabase persistence with detected language stored per conversation.
- No Gmail, Google Maps, HubSpot, CRM, or dashboard code.

## Project Structure

```text
src/
  app.js                    Express routes
  server.js                 Runtime entrypoint
  config.js                 Environment configuration and phone allowlist
  db.js                     PostgreSQL connection pool
  ai-core/
    agent.js                Central AI Core message processor
    openai-client.js        OpenAI API call and prompt assembly
  channels/
    whatsapp.js             WhatsApp send/receive/routing boundary
  memory/
    memory-store.js         Long-term memory persistence
  prompts/system-prompt.md  Editable assistant behavior prompt
  proactive-engine.js       Pending work analysis and daily summaries
  scheduler/checkin.js      Optional daily WhatsApp check-in scheduler
  services/
    conversations.js        Database writes
    language.js             Language detection helper
  suggestions.js            Suggestion lifecycle persistence
  tasks/
    task-planner.js         Approval-gated task creation
  tools/
    registry.js             Placeholder tool registry
sql/schema.sql              Database schema
sql/migrations/             Incremental database migrations
.env.example                Required environment variables
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

3. Fill in `.env`:

- `META_VERIFY_TOKEN`: random token you choose for Meta webhook verification.
- `META_ACCESS_TOKEN`: WhatsApp Cloud API permanent or temporary access token.
- `META_PHONE_NUMBER_ID`: WhatsApp Cloud API phone number ID.
- `APPROVED_PHONE_NUMBER`: your private WhatsApp number in international format, for example `+509XXXXXXXX`.
- `OPENAI_API_KEY`: your OpenAI API key.
- `OPENAI_MODEL`: default is `gpt-4.1-mini`.
- `DATABASE_URL`: PostgreSQL or Supabase Postgres connection string.
- `PGSSL`: use `true` for Supabase-hosted Postgres, usually `false` for local Postgres.
- `ENABLE_PROACTIVE_CHECKIN`: default `false`; set to `true` to send the daily WhatsApp check-in.
- `PROACTIVE_CHECKIN_TIME`: default `08:00`.

4. Create the database tables:

```bash
psql "$DATABASE_URL" -f sql/schema.sql
```

For Supabase, you can also paste `sql/schema.sql` into the Supabase SQL editor.

If you already created the first MVP schema, apply the migration instead:

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

## Meta WhatsApp Webhook

Expose your local server with a tunnel such as ngrok:

```bash
ngrok http 3000
```

In Meta Developer settings, configure:

- Callback URL: `https://your-domain.example/webhook/whatsapp`
- Verify token: same value as `META_VERIFY_TOKEN`
- Subscribe to WhatsApp `messages` webhook events.

## Endpoints

- `GET /health`: health check.
- `GET /webhook/whatsapp`: Meta webhook verification.
- `POST /webhook/whatsapp`: receives WhatsApp messages.

## Language Behavior

The service detects language before calling OpenAI:

- Haitian Creole: replies in Haitian Creole.
- French: replies in French.
- English: replies in English.
- Mixed language: replies mainly in the dominant detected language.
- Unclear language: defaults to Haitian Creole.

## Agent Architecture

WhatsApp is only a communication channel. It parses incoming text, checks the approved phone number, stores the conversation shell, calls AI Core, sends the returned reply, and updates the conversation record.

AI Core is the brain. It receives:

- `message`
- `userPhone`
- `channel`
- `language`

It returns a structured response:

- `replyText`
- `language`
- `channel`
- `userPhone`
- `toolNeeded`
- `taskId`
- `requiresApproval`
- `metadata`

Memory and tasks are stored in PostgreSQL/Supabase, not inside the WhatsApp channel.

## Memory System

The `memories` table stores long-term facts per phone number. The system seeds core memories such as:

- Preferred language: Haitian Creole
- User is Vital-Herne Zephy
- User manages STS-Haiti and ProSpace Community
- Never send external actions without approval

The current MVP can also store simple user-provided memories from messages beginning with phrases like `remember that`.

## Task Planner

The `tasks` table stores approval-gated tasks with:

- `title`
- `description`
- `status`
- `steps`
- `created_at`

Supported statuses are `pending`, `approved`, `running`, `completed`, and `cancelled`.

Important rule: the assistant creates a pending task when a placeholder external tool would be needed. It does not execute the action.

## Tool Manager

The tool registry lives in `src/tools/registry.js`.

Current placeholder tools:

- `gmail`
- `google_maps`
- `hubspot`
- `browser`
- `calendar`

No real Gmail, Google Maps, HubSpot, browser, or calendar APIs are implemented yet.

## Proactive Assistant

Phase 5 Light adds suggestions. The agent can notice pending work, blocked tasks, unapproved tasks, pending suggestions, and recent conversations. It can suggest next actions, but it cannot execute external actions.

WhatsApp commands:

- `Kisa m dwe fè jodi a?`
- `Montre m suggestions yo`
- `Apwouve suggestion 1`
- `Ignore suggestion 1`
- `Complete suggestion 1`

Suggestion statuses:

- `pending`
- `approved`
- `dismissed`
- `completed`

Suggestion priorities:

- `low`
- `medium`
- `high`

Daily proactive check-in is disabled by default. To enable it:

```env
ENABLE_PROACTIVE_CHECKIN=true
PROACTIVE_CHECKIN_TIME=08:00
```

When enabled, the server sends the daily summary through WhatsApp to `APPROVED_PHONE_NUMBER`. The summary is advisory only and does not perform Gmail, Google Maps, HubSpot, browser, calendar, publishing, CRM, lead contact, or scheduling actions.

You can edit assistant behavior anytime in:

```text
src/prompts/system-prompt.md
```

## Database

Each approved incoming WhatsApp message creates one `conversations` record. The record is updated after WhatsApp reply delivery.

Important columns:

- `user_message`
- `assistant_reply`
- `detected_language`
- `channel`
- `agent_response`
- `tool_needed`
- `task_id`
- `status`
- `raw_payload`
- `whatsapp_response`

Additional tables:

- `memories`
- `tasks`
- `suggestions`

Unauthorized phone numbers are rejected before OpenAI and database writes.

## Verification

Run syntax checks and unit tests:

```bash
npm run check
npm test
```

## Deployment Notes

- Use HTTPS for the public webhook URL.
- Keep `.env` out of git.
- Use a long-lived Meta access token in production.
- Set `PGSSL=true` for Supabase.
- Deploy behind a process manager or platform that restarts failed Node processes.
