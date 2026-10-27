# Éles indulás – végső terv és blokkolók

Állapot: 2026. október 27. A 0007-es migráció élesben lefutott (a tulajdonos futtatta, ellenőrizve: 8 migráció, mindkét
tábla létezik). A jogi oldalak, az ÁSZF- és AI-hozzájárulási folyamat korábbi változata élesben van; az újabb commitok
(kontextuális hozzájárulás, a 6. pont döntései) helyben vannak, **nincsenek pusholva**. Élő fizetés, valódi számla nem történt.

**Szakértő nélkül hozott döntések.** Könyvelő és jogász nincs; a 6. pont döntéseit a tulajdonos válaszai és a hatályos
jogszabályszöveg (njt.hu, 2026. szeptember–októberi állapot) alapján hoztuk. Ez **nem jogi vagy adótanácsadói
jóváhagyás**; a forrásokat és a bizonytalan pontokat a 6. pont jelöli. Ha később lesz könyvelő vagy jogász, a 6. pontot
érdemes vele átnézetni.

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
| AI-hozzájárulás | `lib/server/ai.ts`, `components/AiConsent.tsx`, `components/AiConsentCard.tsx` | Szerveroldali kapu minden AI-hívás előtt. Az első AI-kéréskor helyben kéri a hozzájárulást, utána a művelet egyszer folytatódik; a Beállításokban visszavonható. |
| ÁSZF-elfogadás | `components/TermsGate.tsx` | Új tagnak az onboarding első lépése, meglévő tagnak rövid párbeszédablak, az Árak oldalon a fizetés előtt; verzióváltáskor újra. |
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

## 5. Kézi számlázás a Számlázz.hu-ban

Alap: a vevő a teljes díjat a szolgáltatás előtt kártyával fizeti, és nem kér külön számlát, ezért nyugtát kellene adni
(Áfa tv. 165. § (1) b), 166. § (1)); **nyugta helyett számla is kiállítható** (166. § (2)), így pénztárgép nem kell.
Ezért minden fizetésről számla készül.

**Naponta (minden munkanapon):**
1. `ALLOW_PRODUCTION_DB=1 npm run invoices -- list manual` – a nyitott teendők (azonosító, típus, összeg, állapot).
2. Minden teendőt vess össze a Stripe Dashboarddal a `stripeInvoiceId` alapján: fizetve, összeg, dátum, vevő neve,
   számlázási címe, e-mail-címe. Stripe-egység: 299000 = 2 990 Ft. Nem magyar számlázási cím → visszatérítés a Stripe-ban
   (EU-értékesítés nincs bekapcsolva).
3. Számla a Számlázz.hu-ban:
   - vevő: a Stripe-ban látható név, cím, e-mail; magánszemély, adószám nélkül;
   - tétel: pl. „Berripop Premium előfizetés, havi (2026.10.27–2026.11.26)”, mennyiség 1, egységár = a kifizetett összeg;
   - áfakulcs: **AAM** (a számlán így megjelenik az alanyi adómentességre utaló jelölés – Áfa tv. 169. § m));
   - fizetési mód: bankkártya, fizetve; **teljesítés dátuma = a számla kelte** (időszakos szolgáltatás előre fizetve:
     Áfa tv. 58. § (1a) a)); kelte: a kiállítás napja;
   - kiküldés e-mailben a vevőnek a Számlázz.hu-ból.
4. Határidő: a díj már a teljesítés előtt megérkezett, ezért a számlát **haladéktalanul** kell kiállítani
   (Áfa tv. 163. § (2) b)). Gyakorlatban: legkésőbb a fizetést követő munkanapon.
5. Rögzítés: `ALLOW_PRODUCTION_DB=1 npm run invoices -- mark-issued <teendő id> <számlaszám> AAM`.

**Elállás és visszatérítés (14 nap, teljes díj):**
6. Az elállási nyilatkozat beérkezése után legkésőbb 14 napon belül: Stripe Dashboard → a fizetés → teljes
   visszatérítés (ugyanarra a kártyára). A webhook az előfizetést azonnal megszünteti, és `storno` teendőt hoz létre.
7. Számlázz.hu: az eredeti számla **sztornózása**; rögzítés `mark-issued <storno teendő id> <sztornószámla száma> AAM`.
8. Részleges visszatérítés (pl. méltányosságból) → `correction` teendő → helyesbítő számla. Elvesztett kártyás vita →
   `correction` teendő → helyesbítő vagy sztornó számla az elvesztett összegre.

**Megőrzés:** a számlák a Számlázz.hu-ban maradnak; legalább az adó elévüléséig kell őrizni őket (Áfa tv. 179. §), a
tájékoztató 8 évet ígér, ami ezt lefedi. Panaszok és válaszok: 3 év (Fgytv. 17/A. § (7)) – a Gmail-fiókban, címkézve.

**AAM-határ:** 2026-ban 20 millió Ft (2027: 22 millió, 2028: 24 millió) belföldi adóköteles bevétel, az összes
tevékenységgel együtt (AquilaHire is). Évente érdemes ránézni a Számlázz.hu összesítőjére.

**Stripe-nyugták:** a Stripe fizetési visszaigazolása és a Customer Portal számlalistája nem magyar számla. Az ÁSZF ezt
kimondja. Javasolt (Dashboard, a tulajdonos döntése): Settings → Customer emails → a „Successful payments” nyugta
maradhat fizetési visszaigazolásként; ha zavaró, kikapcsolható, mert a számlát a Számlázz.hu küldi.

## 6. Jogi és könyvelési döntések (szakértő nélkül, forrásokkal)

| Kérdés | Döntés | Forrás / megjegyzés |
| --- | --- | --- |
| Áfa | AAM, áfa nélkül; az ár a végösszeg. Vercelben `INVOICE_VAT_KEY_HU=AAM` → az Árak oldalon AAM-megjegyzés. | Tulajdonos: AAM; adószám áfakódja 1. NAV: 2026-os határ 20 M Ft. |
| Számla vagy nyugta | Minden fizetésről számla a Számlázz.hu-ban. | Áfa tv. 159. §, 165–166. § |
| Számla határideje | Haladéktalanul (gyakorlatban következő munkanap). | Áfa tv. 163. § (2) b) |
| Teljesítési dátum | A számla kelte (előre fizetett időszak). | Áfa tv. 58. § (1a) a) |
| AAM a számlán | Számlázz.hu AAM áfakulcs. | Áfa tv. 169. § m), 187. § (2) c) |
| Sztornó / helyesbítés | Teljes visszatérítés → sztornó; részleges / vita → helyesbítő számla. | Kézi, 5. pont |
| Megőrzés | Számla 8 év; panasz 3 év. | Áfa tv. 179. §; Fgytv. 17/A. § (7) |
| Elállás | 14 nap az első előfizetéstől, **teljes** visszatérítés 14 napon belül, ugyanarra a fizetési módra; nyilatkozatminta az ÁSZF-ben; az Árak oldal is említi. | 45/2014. Korm. r. 20. § (2) b), 22–23. §, 2. melléklet; 1. § (4): a fogyasztó javára el lehet térni |
| Panaszkezelés | Írásbeli panaszra 30 napon belül írásban, indokolt válasz; elutasításkor a testület megnevezése; 3 év megőrzés. | Fgytv. 17/A. § (6)–(8) |
| Békéltető testület | Budapesti Békéltető Testület adatai az ÁSZF-ben (székhely szerinti is), a többi testület: bekeltetes.hu. Általános alávetési nyilatkozat nincs. | Fgytv. 17/A. § (1a), 20. §; 45/2014. 11. § (1) w); adatok: bekeltet.bkik.hu/elerhetosegek. A bekeltetes.hu listáját nem tudtuk gépi úton ellenőrizni (JavaScriptből töltődik) – egyszer nézd meg böngészőben. |
| Irányadó jog | Magyar jog, a fogyasztó lakóhelye szerinti kötelező szabályok érintetlenek. | Róma I. rendelet 6. cikk |
| ÁSZF-elfogadás | Be nem pipált jelölőnégyzet + verzió + időpont; lényeges módosításról előzetes értesítés, új elfogadás. | Kódban kész |
| AI-hozzájárulás | Kifejezett, külön hozzájárulás az első AI-kéréskor (GDPR 9. cikk (2) a)); fióktörléskor a nyilvántartás is törlődik (adattakarékosság; törlés után nincs feldolgozás, amit igazolni kellene). | Kódban kész |
| Számlázóprogram | Számlázz.hu (KBOSS.hu Kft.) adatfeldolgozóként a tájékoztatóban. | Cégadatok: Számlázz.hu ÁSZF/adatvédelmi tájékoztató |

**Ami még nyitott vagy kockázatos:**
- A Számlázz.hu adatfeldolgozói szerződése (DPA): a Számlázz.hu ÁSZF-je általában tartalmazza; a fiókban érdemes
  ellenőrizni/elfogadni.
- Hogy az automatikus megújulás nem indít új elállási határidőt: elterjedt értelmezés, a rendelet kifejezetten nem mondja ki.
- DPIA (adatvédelmi hatásvizsgálat) a napló érzékeny adatai miatt: kis méretnél nem biztosan kötelező, de egy rövid
  belső feljegyzés ajánlott.
- EU-értékesítés: kikapcsolva marad.

## 7. Biztonságos következő lépés

1. Vercel env: `INVOICE_VAT_KEY_HU=AAM` (Production), utána redeploy – csak jóváhagyással.
2. Push és deploy jóváhagyással (a feltételek és a tájékoztató új verziója miatt mindenki újra elfogadja a feltételeket).
3. Teszt módú vásárlás saját fiókkal → megjelenik a `manual` teendő; teljes visszatérítés → `storno` teendő. Teszt
   vásárlásról **ne** állíts ki valódi számlát.
4. Élő Stripe-kulcsokra váltás (`stripe:setup` élő kulcsokkal, a „Közös Premium” termék átnevezése) – jóváhagyással.
