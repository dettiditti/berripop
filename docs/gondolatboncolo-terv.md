# Gondolatboncoló – audit és implementációs terv

Állapot: **megvalósítva, kikapcsolva.** A kód kész és tesztelt, de a funkció csak `THOUGHT_DISSECTOR_ENABLED=1` mellett jelenik meg, és a `drizzle/0011_thought_dissector.sql` migráció még nem futott.

## 1. Audit – mit használunk újra

| Terület | Meglévő megoldás | Hogyan használjuk |
|---|---|---|
| AI-hívás | `lib/server/ai.ts` → `runMeteredAi` / `lib/ai/run.ts` → `runAiCall` (AI Gateway, retry-szabályok, foglalás és visszaadás, `ai_calls` költségnapló szöveg nélkül) | Minden Gondolatboncoló-kör ezen megy át, új `feature` névvel (`thought_dissector_turn`, `thought_dissector_summary`). |
| Modell | `DEFAULT_AI_MODEL` (`openai/gpt-5-mini`), felülírható: `AI_GATEWAY_MODEL` | Ugyanez. Opcionális külön modell az összefoglalóhoz, konfigurációból. |
| AI-hozzájárulás | `aiAllowedFor(userId)` a `runMeteredAi`-ban (legal_records, verziózott) | Szerveroldalon minden körnél. Hozzájárulás nélkül a funkció a meglévő `AiConsent` párbeszédet mutatja. |
| Előfizetés | `getUserEntitlements` → `PLAN_LIMITS` (`lib/billing/plans.ts`), Stripe-ból szinkronizált `subscriptions` | Új mezők a `PlanLimits`-ben (lásd 3.). Nincs új billing-logika. |
| Kvóta | `ai_usage (user_id, period, count)` + atomi feltételes upsert (`consumeAiAllowance`) | Új bucket havi periódussal: `thought:2026-11` (Europe/Budapest naptári hónap). |
| Napló | `journal_entries` (titkosított `body`), `journal_reflections` | A forrásbejegyzés `journal_entry_id`-val kapcsolódik; naplóba mentés új bejegyzésként, csak a felhasználó kattintására. |
| Titkosítás | `encryptedText`, `encryptedJson` (`lib/db/encryption.ts`) | Probléma, üzenetek, összefoglaló, gondolattérkép titkosítva. |
| Krízis | `crisisSignal` (`lib/safety/crisis.ts`) + AI `safety` jelzés + meglévő biztonsági kártya | Minden felhasználói üzenetnél; jelzés esetén a folyamat megáll, és a biztonsági kártya jelenik meg. |
| Analytics | `lib/server/analytics.ts` engedélyezett eseménylista, csak eseménynév + plan + context | 9 új eseménynév; context: `dissector`. Szöveg soha. |
| Adatjogok | `lib/server/account.ts` export és törlés | Az új táblák bekerülnek az exportba; a törlés a `users` cascade-del megy. |

## 2. Adatmodell (új migráció, csak additív)

`thought_sessions`
- `id uuid pk`, `user_id text fk users (cascade)`, `journal_entry_id uuid null fk journal_entries (set null)`
- `status` enum: `draft | active | summarizing | completed | abandoned | safety_stop`
- `problem encryptedText`, `messages encryptedJson<Message[]>` (`{ role, viewpoint, text, at }`, bővíthető)
- `viewpoints jsonb` (kiválasztott és teljesített szempontok), `current_viewpoint text`
- `summary encryptedJson`, `map encryptedJson` (strukturált, verziózott: `{ v: 1, ... }`)
- `plan_at_start text` (free/premium), `ai_turns int`, `ai_turn_limit int`
- `quota_period text`, `start_key text` – **unique (user_id, start_key)**: idempotens indítás
- `continued_from uuid null` (ugyanannak a témának a folytatása)
- `created_at`, `updated_at`; index: `(user_id, updated_at desc)`, `(journal_entry_id)`

A naplóba mentés a meglévő `journal_entries` táblába ír, opcionális új oszloppal: `source_session_id uuid null` (additív).

## 3. Konfiguráció (egy helyen, `lib/billing/plans.ts`)

```ts
thoughtSessionsPerMonth: free 2 | premium 30 | premium_plus 60   // fair use
thoughtViewpoints:       free 4 | premium 6
thoughtTurnsPerSession:  free 8 | premium 16                       // AI-körök felső határa
thoughtMaxOutputTokens:  free 500 | premium 800 (összefoglaló: 1200)
thoughtPatterns:         free false | premium true
```

## 4. Jogosultság és kvóta

1. **Indítás** (`startThoughtSession(startKey, problem | entryId)`): hozzájárulás → jogosultság → **egy tranzakcióban** a session sor beszúrása (`on conflict (user_id, start_key) do nothing`) és a havi számláló atomi növelése. Ugyanaz a `start_key` (dupla kattintás, párhuzamos kérés) ugyanazt a sessiont adja vissza, levonás nélkül.
2. **Az alkalom akkor fogy el, amikor Berri első válasza sikeresen megérkezik.** Ha az első AI-hívás elbukik, a foglalás visszamegy (`release`), a session `draft` marad, és újrapróbálható.
3. **Folytatás**: nem fogyaszt alkalmat. Minden kör a sessionön atomi feltétellel nő: `ai_turns < ai_turn_limit`.
4. A frontend csak megjeleníti a szervertől kapott `remaining` értéket; nincs kliensoldali kvóta.

## 5. AI-logika

- Egy kör = egy AI-hívás. Bemenet: rendszerprompt (szabályok + a hat szempont leírása), a probléma, a **kiválasztott szempontok**, a már lezárt szempontok **rövid, strukturált kivonata** (nem a teljes beszélgetés), és az utolsó 4 üzenet.
- Kimenet JSON: `{ reply, nextViewpoint, viewpointDone, safety }`; hosszkorlát, hibás válasz = elutasítva (a meglévő `parse` minta).
- **Szempontválasztás**: az első körben a modell a problémához illő 3–4 (Free) vagy legfeljebb 6 (Premium) szempontot ad vissza; a szerver ellenőrzi és levágja a csomag szerint.
- **Összefoglaló + gondolattérkép**: egy külön hívás a végén, a beszélgetés tényleges tartalmából. Mezők: `known, feel, assume, alternatives, consider, nextSteps, open` + `map` csomópontok.
- **Hibatűrés**: a felhasználó üzenete AI-hívás *előtt* mentődik, így hiba esetén sem vész el; újrapróbálás gomb.

## 6. Felület (meglévő app)

- Belépési pontok: a Napló képernyőn egy „Gondolatboncoló” kártya, a bejegyzés részletein „Ezt szeretném jobban megérteni”, valamint az önismereti funkciók között (Utazás/Fejlődés). Az alsó navigáció nem változik.
- Képernyők: bevezető, probléma, beszélgetés + szempontjelző, összefoglaló, gondolattérkép, korábbiak listája, kvóta-UI, paywall (meglévő pricing linkkel).

## 7. Hozzájárulás – hiányosság és javaslat

- A jelenlegi AI-hozzájárulás azt mondja: „csak az a szöveg kerül AI-feldolgozásra, amelyhez segítséget kérsz”. Egy gondolatboncolás erre illeszkedik.
- **A korábbi gondolatboncolások összekapcsolása (Premium minták) túlmegy ezen**, mert régebbi szövegek is az AI-hoz kerülnének. Javaslat: a meglévő `useInsights` mintájára **kérésenként kapcsolható, alapból kikapcsolt** opció („Korábbi gondolatboncolásaim figyelembevétele”), és az Adatkezelési tájékoztató kiegészítése. A meglévő felhasználók hozzájárulási státusza nem változik automatikusan.
- Az adatkezelési tájékoztatóban nem állítjuk, hogy a szolgáltató nem tárol adatot, amíg ezt az AI Gateway / szolgáltatói feltételek nem igazolják.

## 8. Analytics

Új eseménynevek a `FUNNEL_EVENTS` listában: `thought_dissector_opened, _started, _viewpoint_completed, _message_sent, _completed, _abandoned, _saved_to_journal, _quota_exhausted, _premium_clicked`. Context: `dissector`. Tartalom soha.

## 9. Tesztek (vitest, a meglévő `tests/` mintájára, hamis generátorral)

Free 1., 2. indítás; 3. elutasítva; havi visszaállás (periódus-kulcs); Premium jogosultság és szempontszám; jogosulatlan hívás; más felhasználó sessionje (404); dupla kattintás / párhuzamos indítás egy levonással; AI Gateway hiba → nincs levonás, üzenet megmarad; megszakadt session folytatása; naplóból indítás kapcsolódással; naplóba mentés csak kifejezett kérésre; session törlése; krízisjelzés megállítja a folyamatot; analytics nem tartalmaz szöveget. Mobilnézet: böngészőben ellenőrizve; a billentyűzetet valódi eszközön kell kipróbálni.

## 10. Kockázatok

- **Költség**: egy session legfeljebb 8–16 kör + 1 összefoglaló. gpt-5-mini áron becslés kb. 0,01–0,03 USD / session; a havi keret és a körlimit felülről korlátozza.
- **Adatvédelem**: érzékeny tartalom; titkosítva tárolva, csak a tulajdonos olvassa, exportálható és törölhető.
- **Biztonság**: a krízisfelismerés nem tökéletes; a súgó link mindig elérhető marad.

## 11. Élesítés lépései (mind külön jóváhagyással)

1. Kód átnézése, commit, push.
2. `drizzle/0011_thought_dissector.sql` futtatása (csak új tábla, meglévő adathoz nem nyúl).
3. Adatkezelési tájékoztató kiegészítése (tárolt beszélgetések, Premium minták opt-in).
4. Vercelen `THOUGHT_DISSECTOR_ENABLED=1`, majd ellenőrzés egy saját fiókkal.

Visszakapcsolás: a változó törlése elrejti a funkciót; az adatok megmaradnak.

## 12. Ami a tervtől eltér

- A konfiguráció: Free 2 alkalom/hó, 4 nézőpont, 9 AI-kör/alkalom; Premium 30/hó, 6 nézőpont, 18 kör; Premium Plus 60/hó, 24 kör (`lib/billing/plans.ts`).
- Free-ben egy nézőpont egy válasz; Premiumban legfeljebb 3, és Berri dönti el, mikor lép tovább.
- A Premium minták a heti napló-AI keretből fogyasztanak, és semmit nem tárolnak.
- Krízisjelzés a problémában: semmi nem tárolódik, nem fogy alkalom, és nem megy AI-hoz; a biztonsági kártya jelenik meg.
