# Content encryption at rest

Members' private texts are encrypted in the database with AES-256-GCM
(`lib/db/encryption.ts`). The schema marks those columns `encryptedText` or
`encryptedJson`. They keep their Postgres types, so the change needs no
migration. Code reads and writes them as before: Drizzle encrypts on write
and decrypts on read.

Encrypted columns:
- `answers`: `text`, `reflection`, `reflection_prompt`
- `journal_entries`: `body`
- `journal_reflections`: `noticed`, `strength`, `explore`, `next_step`, `alternatives`, `suggestion_text`, `correction`
- `growth_insights`: `text`
- `daily_checkins`: `note`, `ai_reply`
- `world_moments`: `note`, `own_words`

Not encrypted yet (possible next step):
- `growth_goals` (title, details), `growth_steps`, `path_assessments` (answers, follow-ups, plan) and `goal_journeys`
- `custom_questions` and circle names

The server holds the key and decrypts. This protects a leaked database,
backup or database credentials. It is **not** end-to-end encryption:
- The server reads the texts to show them to their owner.
- The server shows shared answers to the member's circle.
- The server sends a text to the AI service when the member asks for it.

## Keys

- `CONTENT_ENCRYPTION_KEY`: the active key, 32 random bytes, base64. Generate it with `openssl rand -base64 32`.
- `CONTENT_ENCRYPTION_OLD_KEYS`: optional. Older keys, comma-separated, that are still needed to read rows written before a rotation.

Each stored value names its key by a short hash (`enc:<keyId>:<iv>:<data>`).
Values without that form are legacy plaintext and are read as they are.

**Losing the key means losing every text encrypted with it.** Keep a copy
outside Vercel, for example in a password manager.

Without a key, new writes stay plaintext, as before. Reading an encrypted
value without its key fails with an error, so ciphertext is never shown.
Once the key is set, never remove it from any environment that reads this
database.

## Rollout

The production, preview and local environments all use the one shared
database. Every environment that reads it needs the same key.

1. Generate the key and store a copy safely.
2. Add `CONTENT_ENCRYPTION_KEY` in Vercel for Production, Preview and Development.
3. Add the same key to `.env.local`.
4. Deploy. From then on, new and edited texts are stored encrypted.
5. Create a Neon branch as a backup.
6. Count the rows still in plaintext:
   ```bash
   ALLOW_PRODUCTION_DB=1 npm run encrypt:content
   ```
7. Encrypt them:
   ```bash
   ALLOW_PRODUCTION_DB=1 npm run encrypt:content -- --apply
   ```
   This prints counts only and is safe to re-run.
8. Check in the app that the journal, answers, circle answers and check-ins read correctly.
9. Only after that, update the Privacy Policy ("Biztonság") and the AI consent text to say that the content is also encrypted in storage.

## Rotation

1. Move the current key to `CONTENT_ENCRYPTION_OLD_KEYS`.
2. Set the new key as `CONTENT_ENCRYPTION_KEY`.

New writes then use the new key, and old rows stay readable. Re-encrypting old
rows under the new key is not implemented: the backfill only converts plaintext.
