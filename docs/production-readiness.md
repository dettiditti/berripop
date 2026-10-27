# Éles indulás – végső terv és blokkolók

Állapot: 2026. október 27. Commitolva lokálisan (`main`), **nincs pusholva, nincs telepítve**. A 0007-es migráció
**nem futott le**. Élő fizetés, valódi számla, éles adatmódosítás nem történt.

**A fizetős indulás NEM áll készen**, amíg a 6. pontban felsorolt adózási, számlázási és fogyasztóvédelmi kérdések
nincsenek lezárva. Jogászi vagy könyvelői jóváhagyás egyik szövegre vagy folyamatra sem történt.

## 0. Elfogadott üzleti döntések

- Magyar egyéni vállalkozó, alanyi adómentes (AAM).
- Első vevők: magyarországi magánszemélyek. EU-értékesítés kikapcsolva a jóváhagyásig.
- Fizetés: Stripe. Számla: **kézzel**, az első indulásnál. Számlázz.hu-automatizálás: az első vásárlás utánra halasztva.
- Push és deploy csak kifejezett jóváhagyással.

## 1. A kód jelenlegi állapota (ellenőrizve)

| Terület | Hol | Állapot |
| --- | --- | --- |
| Számlázó API | – | Nincs bekötve. Nincs Számlázz.hu-kód, -hívás vagy -kulcs a kódban. `INVOICING_MODE` a kódban rögzítetten `"manual"` (`lib/billing/sales.ts`). |
| Fizetés kapuja | `lib/billing/sales.ts`, `lib/server/billing.ts` | A checkout csak engedélyezett számlázási országgal indul. Alapból `HU`, áfakulcs és számlázási beállítás **nem** kell hozzá. EU-ország csak `EU_SALES_ENABLED=true` + országonkénti `INVOICE_VAT_KEY_<CC>` mellett – egyik sincs beállítva. |
| ÁSZF a fizetés előtt | `lib/server/actions.ts` (`startCheckoutAction`) | **Ebben a körben javítva:** az Árak oldal kívül esik az alkalmazáson belüli ÁSZF-kapun, ezért a szerver most elutasítja a fizetést (`terms_required`), ha a tag nem fogadta el a feltételek aktuális verzióját. |
| Checkout tartalma | `lib/server/billing.ts` | Kötelező számlázási cím (`billing_address_collection: "required"`, a Stripe-ügyfélen frissül), `client_reference_id`, metadata `userId` + `disclosureVersion`, a tájékoztató verziója `legal_records`-ba. |
| Fizetés-ellenőrzés | `confirmCheckout` | A sikeroldal URL-je semmit sem bizonyít; a session a Stripe API-ból, felhasználóhoz kötve ellenőrzött. Változatlan. |
| Webhook | `lib/server/billing.ts` `handleWebhook`, `lib/billing/webhook.ts` | Aláírás-ellenőrzés (`STRIPE_WEBHOOK_SECRET`), élő/teszt mód szűrés, `stripe_events` claim → duplikáció kiszűrve; hiba esetén release, hogy a Stripe újrapróbálása feldolgozódjon. Változatlan. |
| Kézi számlázási teendő | `lib/server/invoicing.ts`, `invoices` tábla | `invoice.paid` (összeg > 0) → `kind=invoice`, `status=manual`. `charge.refunded` (teljes → `storno`, részleges → `correction`) és elvesztett `charge.dispute.closed` (`correction`) → `status=manual`. Duplikáció ellen kétszeres védelem: az esemény-claim és az egyedi `operation_key` (`invoice:<in_…>`, `reversal:<evt_…>`) `ON CONFLICT DO NOTHING`-gal. Csak azonosítók, összeg (Stripe-egység: Ft × 100), pénznem, állapot – vevőadat és számlatartalom nincs. |
| Teljes visszatérítés, elvesztett vita | `endSubscription` | Az előfizetést azonnal megszünteti (korábbi viselkedés, változatlan). |
| AI-hozzájárulás | `lib/server/ai.ts`, `components/AiConsentCard.tsx` | Szerveroldali kapu minden AI-hívás előtt. **Meglévő tagoknál is**: az AI-funkciók a hozzájárulásig szünetelnek. |
| ÁSZF-kapu | `components/TermsGate.tsx` | Új és meglévő tagoknak az első betöltéskor; verzióváltáskor újra. |
| Napi cron | `app/api/cron/daily/route.ts`, `vercel.json` | Csak megőrzési szabályok; beállítás nélkül nem töröl semmit. |

## 2. Helyi ellenőrzések

- `tsc --noEmit`, `eslint`, `next build`: hibátlan.
- `vitest`: 17 fájl, 159 teszt, mind zöld. Lefedi: fizetés kézi számlázás mellett, EU letiltva, AAM-megjegyzés csak beállítva, teendő rögzítése sikeres fizetésnél, duplikált esemény/sor nem hoz új teendőt, nulla összegű számla kimarad, visszatérítés és vita besorolása, nincs hálózati hívás, nincs vevőadat a teendőben, a meglévő Stripe-webhook (aláírás nélkül nem, élő/teszt mód, idempotencia, release hibánál) és előfizetési tesztek.
- **Mind mock.** Élő Stripe-fizetést, valódi webhookot és éles adatbázist a tesztek nem érintenek, a viselkedést élesben nem igazolják.
- A `terms_required` szerveroldali ellenőrzést csak a típusellenőrzés fedi, nincs rá automatikus teszt (Clerk-munkamenetet igényel).

## 3. Szükséges Dashboard-beállítások

### Stripe

1. **Webhook-végpont** `https://www.berripop.com/api/stripe/webhook` – ellenőrizd, hogy ezek az események mind be vannak kapcsolva (a kezelő pontosan ezeket fogadja, `HANDLED_EVENTS`):
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, **`invoice.paid`**, `invoice.payment_failed`, **`charge.refunded`**, **`charge.dispute.closed`**.
   A kódon nem kell változtatni; az utóbbi hármat a kezelő már feldolgozza. Hogy a Dashboardon be vannak-e kapcsolva, a kódból nem ellenőrizhető.
2. Élő módban külön végpont és külön `STRIPE_WEBHOOK_SECRET` kell (a teszt módú titok élőben nem működik); élő kulcs mellett a teszt eseményeket a kód figyelmen kívül hagyja.
3. Nincs Stripe Tax, nincs adósor az árakon.
4. A Stripe e-mailes nyugtái/számlái: a könyvelővel egyeztetve maradhatnak vagy kikapcsolhatók. **Nem helyettesítik a magyar számlát**, és nem szabad úgy megfogalmazni őket, mintha azok lennének.
5. Ügyfélportál: a név- és címmódosítás engedélyezése, hogy a későbbi számlák helyes adatokkal készüljenek.

### Vercel (env)

| Név | Kell? | Megjegyzés |
| --- | --- | --- |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | igen (meglévő) | Élő induláshoz élő kulcsok. |
| `INVOICE_VAT_KEY_HU` | nem | `AAM` beállítva az Árak oldalon megjelenik: „Alanyi adómentes értékesítés (AAM): az ár áfát nem tartalmaz”. A szöveget a könyvelő hagyja jóvá. |
| `SALES_COUNTRIES`, `EU_SALES_ENABLED`, `INVOICE_VAT_KEY_<CC>` | **ne állítsd be** | Alapból csak HU. |
| `CRON_SECRET` | a cronhoz | Nélküle a napi útvonal mindent elutasít. |
| `AI_CONSENT_MODE` | nem | Alapból kötelező hozzájárulás; `not_required` csak jogászi döntés után. |
| `RETENTION_*_DAYS` | nem | Megőrzési idők jóváhagyás után. |

Nem szükséges és nincs használatban: `INVOICING_MODE`, `SZAMLAZZ_*`.

## 4. Migráció (0007) és mentés

**Pontos hatás** (`drizzle/0007_legal_and_invoicing.sql`, 44 sor):
- `CREATE TABLE "legal_records"` és `CREATE TABLE "invoices"`;
- két idegen kulcs a `users(id)`-ra (`legal_records` → `ON DELETE CASCADE`, `invoices` → `ON DELETE SET NULL`);
- 6 index (köztük egyedi: `invoices.operation_key`, `invoices.provider_external_id`).
- Nincs `DROP`, `DELETE`, `UPDATE`, nincs meglévő oszlop módosítása; meglévő adat nem változik. A `gen_random_uuid()` már a 0001-es migrációban is szerepel.
- Offline ellenőrizve: a journal 0000–0007 sorrendben, `drizzle-kit check` és `generate` szerint a séma és a migrációk egyeznek.
- **Nem ellenőrizve:** hogy az éles adatbázisban a 0000–0006 mind lefutott-e, és hogy a két tábla nem létezik-e már. Az erre szolgáló, csak olvasó lekérdezést a munkamenet jogosultsági szabálya nem engedte; futtatás előtt neked kell megnézned (lent).
- Az `invoices` tábla `attempts`, `locked_until`, `next_attempt_at`, `provider_external_id` oszlopai a későbbi automatizálásnak vannak fenntartva.

**Sorrend – a kód élesítése csak ezek után:**
1. Neon Console → Branches: mentési ág (vagy point-in-time restore pont) az éles ágról.
2. Csak olvasó ellenőrzés a Neon SQL Editorban: `select count(*) from drizzle.__drizzle_migrations;` (7 legyen), és hogy a `legal_records` / `invoices` táblák még nincsenek.
3. Futtatás jóváhagyással: `ALLOW_PRODUCTION_DB=1 npm run db:migrate`.
4. Visszaállítás, ha kell (amíg nincs bennük éles adat): `DROP TABLE invoices; DROP TABLE legal_records;` – és a `drizzle.__drizzle_migrations` utolsó sorának törlése; vagy visszaállás a mentési ágra.
5. Ha a kód a migráció előtt kerülne élesbe, a bejelentkezett tagok betöltési hibát kapnak (az ÁSZF-állapot a `legal_records` táblát olvassa), és a webhook a teendő rögzítésénél hibára futna (a Stripe újrapróbálja).

## 5. Ideiglenes kézi számlázási folyamat

**Egyeztetés (fizetés → teendő):**
1. Naponta: `npm run invoices -- list manual` (csak azonosítót, típust, összeget, állapotot ír ki). Éles adatbázison `ALLOW_PRODUCTION_DB=1` kell elé.
2. Minden teendőt vess össze a Stripe Dashboarddal a `stripeInvoiceId` alapján: fizetve, összeg, pénznem, dátum. A Stripe-egység: 299000 = 2 990 Ft.
3. Ellenőrizd a vevő számlázási címét (a kód fizetés után nem szűri ki a nem magyar címet). Ha nem magyar: könyvelői döntés, és szükség esetén visszatérítés.

**Számla kiállítása:**
4. A számlát a kiválasztott számlázóprogramban kell kiállítani, a Stripe-ban látható névvel, címmel, e-mail-címmel, a könyvelő által jóváhagyott adókezeléssel és teljesítési dátummal.
5. Rögzítés: `npm run invoices -- mark-issued <teendő id> <számlaszám> [AAM]`.

**Visszatérítés, javítás:**
6. Teljes visszatérítés → `kind=storno`; részleges visszatérítés vagy elvesztett vita → `kind=correction`. A bizonylatot (sztornó / helyesbítő számla) kézzel kell kiállítani, majd ugyanígy rögzíteni. A megjegyzés (`note`) jelzi, ha az eredeti teendőt nem találta (pl. az esemény a fizetés előtt érkezett).
7. Visszatérítést kezdeményezni csak a Stripe Dashboardon lehet; az alkalmazás nem indít visszatérítést.

**Megőrzés:**
8. A számlák és a kapcsolódó bizonylatok a számlázóprogramban, a fizetési adatok a Stripe-nál maradnak. Az `invoices` tábla sorai fióktörléskor is megmaradnak (a fiók-hivatkozás nullázódik), a megőrzési cron soha nem törli őket. A pontos megőrzési időt a könyvelő határozza meg; a jogi szöveg „a számviteli jogszabályokban előírt ideig” fogalmaz.

**Adatkezelési tájékoztató:** számlázóprogram még nincs kiválasztva, ezért a tájékoztató egyet sem nevez meg. Ha kiválasztottad (és adatfeldolgozó), fel kell venni az „Adatfeldolgozók” közé (`lib/legal/content.ts`, mindkét nyelven), és frissíteni kell a verziót (`LEGAL_VERSIONS.privacy`).

## 6. Nyitott jogi és könyvelési döntések

### Könyvelő
1. A kézi számlázás rendje: a számlakiállítás határideje a fizetéshez képest, a teljesítési dátum havi és éves (előre fizetett) előfizetésnél.
2. Az AAM alkalmazása erre a szolgáltatásra, a számlán kötelező AAM-szöveg, és az alanyi adómentesség értékhatárának figyelése.
3. Sztornó és helyesbítő számla rendje teljes, részleges és éves előfizetés visszatérítésénél, illetve elvesztett vitánál.
4. A számlázóprogram kiválasztása és a számlaadatok (NAV) kezelése a programban.
5. A Stripe nyugtáinak sorsa (maradhatnak-e, hogyan ne keltsék a számla látszatát).
6. Bizonylatmegőrzés ideje és helye.
7. EU-értékesítés feltételei (később): adókezelés és bizonylatok.

### Jogász
1. **AI-hozzájárulás:** megfelelő-e a hozzájárulás mint jogalap (GDPR 6. cikk (1) a) és 9. cikk (2) a)), a Beállításokban lévő szöveg és a verziókezelés; kell-e a hozzájárulás bizonyítékát a fióktörlés után is megőrizni (most a fiókkal együtt törlődik).
2. **ÁSZF-elfogadás:** elegendő-e a be nem pipált jelölőnégyzet + verzió + időpont az első használatkor és a fizetés előtt; mi a teendő módosításkor (értesítés, határidő).
3. **Panaszkezelés:** a feltételekben most csak e-mail és postai cím szerepel; hiányzik a válaszadás rendje, határideje és a jegyzőkönyv-szabályok.
4. **Elállási jog:** digitális szolgáltatásnál a 14 napos elállási jog alóli kivétel csak kifejezett beleegyezéssel és tudomásulvétellel érvényes. **Ilyen nyilatkozat nincs bekapcsolva**, tehát a fogyasztók elállási joga jelenleg fennáll, és erről a feltételekben tájékoztatni kell; a visszatérítést a Stripe Dashboardon kell tudni intézni. A szöveget és a folyamatot a jogász határozza meg.
5. **Békéltető testület:** az illetékes testület neve, címe és elérhetősége hiányzik a feltételekből; a jogász erősítse meg, melyik az illetékes, és milyen adatokat kell feltüntetni.
6. **Irányadó jog fogyasztóknál**, felelősségkorlátozás, tiltott tartalmak, felfüggesztés (lásd `docs/legal-open-questions.md`).

## 7. Biztonságos következő lépés

1. Jogász és könyvelő átnézi a 6. pontot és a jogi oldalakat (`/terms`, `/privacy`, `/cookies`, `/contact`).
2. A számlázóprogram kiválasztása → az adatfeldolgozói lista frissítése.
3. Stripe teszt módban: webhook-események ellenőrzése a Dashboardon.
4. Mentés → csak olvasó ellenőrzés → migráció (4. pont), jóváhagyással.
5. Push és deploy jóváhagyással, majd teszt módú vásárlás saját fiókkal: teendő keletkezik-e, duplikált esemény újraküldésénél nem keletkezik-e második.
6. Élő kulcsokra váltás csak a 6. pont lezárása után.
