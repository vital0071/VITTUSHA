# Vittusha AI Platform - Sprint 2 Memory Engine

Node.js + Express service that receives channel messages, routes them into the Vittusha Brain, replies on the active messaging channel, and stores conversations, memories, and approval-gated tasks in PostgreSQL or Supabase.

## Features

- Meta WhatsApp Cloud API webhook verification.
- Incoming WhatsApp text message handling.
- Private phone allowlist with `APPROVED_PHONE_NUMBER`.
- OpenAI Responses API integration.
- Brain Foundation with a central `processMessage()` contract.
- ExecutiveAgent as the default agent.
- Channel layer for send/receive only.
- Sprint 2 Memory Engine for user, conversation, fact, preference, project, business, language, objective, and custom memories.
- Context builder that injects relevant memories, recent messages, preferences, projects, goals, business, language, and current conversation into OpenAI prompts.
- Memory scoring by importance, freshness, usage, confidence, and relevance.
- Automatic memory extraction after full user/assistant turns.
- Intent detection for `greeting`, `question`, `task`, `research`, `action`, and `conversation`.
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
  agents/
    ExecutiveAgent.js        Default Sprint 1 agent
  ai-core/
    agent.js                Legacy AI Core entrypoint kept for compatibility
    openai-client.js        OpenAI API call and prompt assembly
  brain/
    Brain.js                Central Brain with processMessage()
    BrainPipeline.js        Message lifecycle orchestration
    ContextBuilder.js       Language and memory context loading
    IntentDetector.js       Simple intent classifier
    ResponseGenerator.js    OpenAI-backed response generation
  channels/
    ChannelGateway.js       Gateway interface: receive/send/typing/acknowledge
    ChannelGatewayRegistry.js
    MetaWhatsAppCloudGateway.js
                             Current Meta webhook compatibility gateway
    WhatsAppGateway.js      Empty future placeholder, intentionally unused
    whatsapp.js             WhatsApp send/receive boundary that calls Brain
    telegram/
      TelegramGateway.js    Telegram normalization gateway for the target channel
  memory/
    ConversationMemory.js   Brain-facing memory facade
    MemoryService.js        Public Memory Engine API
    MemoryRepository.js     PostgreSQL repository with fallback
    MemoryExtractor.js      Automatic memory extraction
    MemoryRetriever.js      Relevant memory retrieval
    MemoryScorer.js         Importance/freshness/usage/confidence/relevance scoring
    MemoryDirectAnswer.js   Direct answers from known memory when possible
    MemoryContextBuilder.js Structured prompt context builder
    MemoryTypes.js          Canonical memory type list
    README.md               Memory module documentation
    memory-store.js         Legacy memory helpers kept for compatibility
  prompts/system-prompt.md  Editable assistant behavior prompt
  proactive-engine.js       Pending work analysis and daily summaries
  scheduler/checkin.js      Optional daily WhatsApp check-in scheduler
  services/
    conversations.js        Database writes
    language.js             Language detection helper
  shared/
    logger.js               Shared logger export
  suggestions.js            Suggestion lifecycle persistence
  tasks/
    task-planner.js         Approval-gated task creation
  tools/
    ToolRegistry.js         Tool registry class wrapper
    registry.js             Placeholder tool registry
sql/schema.sql              Database schema
sql/migrations/             Incremental database migrations
.env.example                Required environment variables
```

## Sprint 1 Architecture

The channel does not own AI logic anymore. The HTTP server does not know OpenAI and does not call agent code. It receives a webhook, identifies the channel, resolves the matching gateway, and hands off the payload.

```text
Webhook
  -> Channel Gateway
  -> Brain.processMessage({
       tenantId,
       userId,
       channel,
       conversationId,
       message,
       metadata
     })
  -> BrainPipeline
  -> ContextBuilder
  -> IntentDetector
  -> ExecutiveAgent
  -> ResponseGenerator
  -> OpenAI client
  -> Channel response
```

```mermaid
flowchart TD
    Client["Client"]
    Gateway["Gateway"]
    Brain["Brain"]
    Memory["Memory"]
    Agents["Agents"]
    Tools["Tools"]
    OpenAI["OpenAI"]

    Client --> Gateway
    Gateway --> Brain
    Brain --> Memory
    Brain --> Agents
    Agents --> Tools
    Agents --> OpenAI
```

`Brain.processMessage()` returns:

```text
{
  reply,
  actions,
  logs
}
```

Current production routing still supports the existing Meta WhatsApp webhook through `MetaWhatsAppCloudGateway`. `src/channels/telegram/TelegramGateway.js` is present as the target Telegram gateway boundary and follows the same gateway contract.

Technical comment: this architecture keeps all channel-specific concerns outside the Brain. A future Web App, public API, Discord bot, Slack app, or Mobile App only needs a gateway that implements:

- `receive()`
- `send()`
- `typing()`
- `acknowledge()`

Once a new gateway converts its native payload into the Brain message contract, the Brain, Memory, Agents, Tools, and OpenAI response path remain unchanged. This is the reason new channels can be added without modifying the Brain.

## Sprint 2 Memory Engine

The Brain no longer depends only on the current message. Before each OpenAI call, it asks the Memory Engine to build a scoped conversation context.

Memory flow:

```text
Incoming message
  -> Brain
  -> ContextBuilder
  -> MemoryService.buildConversationContext()
  -> MemoryRetriever.findRelevantMemories()
  -> MemoryScorer
  -> MemoryContextBuilder
  -> ResponseGenerator
  -> OpenAI
  -> MemoryService.recordConversationTurn()
  -> MemoryExtractor
  -> MemoryRepository.saveMemory()
```

Memory types:

- `PERSON`
- `PROJECT`
- `BUSINESS`
- `PREFERENCE`
- `OBJECTIVE`
- `FACT`
- `TASK`
- `LOCATION`
- `LANGUAGE`
- `RELATION`
- `CONTACT`
- `CUSTOM`

The Memory Engine exposes:

- `saveMemory()`
- `searchMemory()`
- `updateMemory()`
- `archiveMemory()`
- `deleteMemory()`
- `findRelevantMemories()`
- `buildConversationContext()`

The OpenAI prompt receives these sections:

- Current User
- Relevant Memories
- Recent Messages
- Preferences
- Projects
- Goals
- Business
- Language
- Current Conversation

Embeddings and future RAG are prepared through `memory_embeddings`, `memory_tags`, and `memory_links`, but vector retrieval is intentionally not implemented yet.

Direct memory answers are supported for known facts. For example, after `Je développe Vittusha AI.`, the question `Quel projet je développe ?` is answered from memory as `Vous développez Vittusha AI.` instead of asking the user to repeat.

Project memory extraction recognizes French and Haitian Creole variants such as `Je développe Vittusha AI`, `Map devlope Vittusha AI`, `M ap devlope Vittusha AI`, and `Je travaille sur Vittusha AI`.

Memory diagnostic logs include `memory_extracted`, `memory_extracted_type`, `memory_stored`, `memories_retrieved`, `memory_context_created`, `context_injected`, `memory_direct_answer_match`, `memory_direct_answer_failed_reason`, and `memory_used`.

## Sprint Quality Gate

Every sprint must include:

- Unit tests for isolated rules and services.
- Integration tests across Brain, Memory, Agents, and repositories.
- E2E tests that simulate the real Telegram behavior.

The required E2E memory regression is:

```text
User: Je développe Vittusha AI.
User: Quel projet je développe ?
Expected: Vous développez Vittusha AI.
```

This E2E test must fail if OpenAI is called for the second message. A sprint is not considered complete until this E2E test passes.

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
psql "$DATABASE_URL" -f sql/migrations/003_memory_engine.sql
```

5. Start the server:

```bash
npm run dev
```

Production:

```bash
npm start
```

Run syntax checks:

```bash
npm run check
```

Run tests:

```bash
npm test
```

## PM2 Operations

Restart the production process:

```bash
pm2 restart vittusha-ai
```

Inspect logs:

```bash
pm2 logs vittusha-ai
```

Useful PM2 commands:

```bash
pm2 status
pm2 describe vittusha-ai
pm2 monit
```

The Brain logs these lifecycle events:

- `message_received`
- `memory_loaded`
- `intent_detected`
- `agent_selected`
- `openai_called`
- `response_generated`
- `response_sent`

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

## Brain and Agent Architecture

The messaging channel is only a communication boundary. It parses incoming text, checks the approved user, stores the conversation shell, calls the Brain, sends the returned reply, and updates the conversation record.

The Brain receives:

- `tenantId`
- `userId`
- `channel`
- `conversationId`
- `message`
- `metadata`

It returns a structured response:

- `reply`
- `answer`
- `intent`
- `agent`
- `actions`
- `memories`
- `logs`

`answer` remains as a temporary compatibility alias for existing code paths. New gateways should read `reply`.

All messages currently pass through `ExecutiveAgent`. Memory, tool detection, task planning, and OpenAI response generation happen behind the Brain boundary, not inside the channel.

## Memory System

The `memories` table stores long-term facts per phone number. The system seeds core memories such as:

- Preferred language: Haitian Creole
- User is Vital-Herne Zephy
- User manages STS-Haiti and ProSpace Community
- Never send external actions without approval

The current MVP can also store simple user-provided memories from messages beginning with phrases like `remember that`.

`ConversationMemory` also loads recent conversation turns from PostgreSQL using the existing `conversations` table. If PostgreSQL is unavailable during local development, it falls back to an in-memory buffer capped at 20 messages per conversation.

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
