# Vittusha Memory Engine

Sprint 2 introduces the Memory Engine as a modular service behind the Brain. The goal is to make Vittusha answer with useful context, not only the current message.

## Components

- `MemoryService.js`: public API used by the Brain and future internal services.
- `MemoryRepository.js`: PostgreSQL repository with an in-memory fallback for local resilience.
- `MemoryExtractor.js`: rule-based automatic extraction after a full user/assistant turn.
- `MemoryRetriever.js`: retrieves only the best candidate memories before OpenAI calls.
- `MemoryScorer.js`: scores memories by importance, freshness, usage, confidence, and relevance.
- `MemoryContextBuilder.js`: builds the structured context injected into the OpenAI prompt.
- `MemoryDirectAnswer.js`: answers direct factual questions from memory before OpenAI.
- `MemoryTypes.js`: canonical memory type list.

## Public API

- `saveMemory()`
- `searchMemory()`
- `updateMemory()`
- `archiveMemory()`
- `deleteMemory()`
- `findRelevantMemories()`
- `buildConversationContext()`

## Context Sections

The Brain receives a structured context with:

- Current User
- Relevant Memories
- Recent Messages
- Preferences
- Projects
- Goals
- Business
- Language
- Current Conversation

## SaaS Principles

The Brain does not know PostgreSQL, embeddings, tags, or future vector search details. It only asks the memory module for a conversation context. This keeps the platform ready for future RAG, tenant isolation, semantic search, and richer dashboards without changing channel gateways or the Brain contract.

Embeddings are prepared through `memory_embeddings`, but vector search is intentionally not implemented in Sprint 2.

## Direct Memory Answers

If a user asks a direct question that maps to a known memory, Vittusha answers from memory first instead of asking the user to repeat.

```text
User: Je développe Vittusha AI.
Memory: [PROJECT] Vittusha AI: Vittusha AI

User: Quel projet je développe ?
Assistant: Vous développez Vittusha AI.
```

Project extraction currently recognizes:

- `Je développe Vittusha AI`
- `Map devlope Vittusha AI`
- `M ap devlope Vittusha AI`
- `Je travaille sur Vittusha AI`

Project retrieval currently recognizes:

- `Quel projet je développe ?`
- `Ki pwojè m ap devlope ?`
- `Ki pwoje map devlope ?`
- `Sur quel projet je travaille ?`

This currently covers direct questions about `PROJECT`, `PERSON`, `BUSINESS`, `LANGUAGE`, `OBJECTIVE`, and `PREFERENCE`.

## Diagnostic Logs

The Memory Engine emits these logs across the pipeline:

- `memory_extracted`: memories identified after a user/assistant turn.
- `memory_stored`: normalized memory persisted or upserted.
- `memory_saved`: compatibility log for saved memories.
- `memories_retrieved`: scored memories selected for context.
- `memory_retrieved`: compatibility retrieval log.
- `memory_context_created`: prompt context sections created.
- `context_injected`: memory context passed to the OpenAI prompt.
- `memory_direct_answer_match`: direct-memory answer matched a memory.
- `memory_direct_answer_failed_reason`: direct-memory answer did not match and why.
- `memory_used`: direct answer generated from memory.
- `memory_archived`: memory archived.
