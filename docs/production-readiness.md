# Éles indulás: jogi elfogadás, AI-hozzájárulás, értékesítés, kézi számlázás

Állapot: 2026. október 27. Semmi sincs commitolva, pusholva vagy telepítve; a 0007-es migráció **nem futott le**.
Minden teszt mockokkal fut: **élő Stripe-fizetést nem próbáltunk.**

> **A Számlázz.hu-integráció el van halasztva** az első vásárlás utánra. Az alkalmazás nem hív számlázó API-t, és
> nem állít ki automatikusan számlát, sztornót vagy helyesbítő számlát. **A számlaadási kötelezettség ettől nem
> szűnik meg:** minden eladásról a megfelelő bizonylatot kézzel kell kiállítani (5. pont). A Stripe nyugtáit és
> számláit az alkalmazás nem tekinti a magyar szabályok szerinti számlának.

## 1. Mi készült el

| Terület | Fájlok | Mit csinál |
| --- | --- | --- |
| Jogi nyilvántartás | `lib/legal/records.ts`, `lib/server/legal.ts`, `legal_records` tábla | Csak hozzáfűzött sorok: ÁSZF-elfogadás, AI-hozzájárulás (adás/visszavonás), a fizetés előtt látott tájékoztató verziója. Verzió + időpont + felhasználó. |
| ÁSZF-kapu | `components/TermsGate.tsx`, `components/KozosApp.tsx` | Új és meglévő tagoknak is megjelenik, amíg az aktuális verziót el nem fogadják; verzióváltáskor újra. Be nem pipált jelölőnégyzet. |
| AI-hozzájárulás | `components/AiConsentCard.tsx`, `lib/server/ai.ts` | Beállítások → „AI-funkciók”: adás, visszavonás, verzió. Hozzájárulás nélkül egyetlen AI-hívás sem megy ki (`ai_consent_required`). |
| Értékesítés | `lib/billing/sales.ts` | Alapból csak HU. EU-országok csak `EU_SALES_ENABLED=true` **és** országonkénti jóváhagyott áfakulcs mellett. A számlázás rögzítetten kézi (`INVOICING_MODE = "manual"` a kódban), és **nem blokkolja** a fizetést. |
| Checkout | `lib/server/billing.ts` | Kötelező számlázási cím (a Stripe-nál marad, a kézi számlához kell), a tájékoztató verziója metadata + `legal_records`. A fizetés-ellenőrzés, a webhook-aláírás, a duplikációszűrés és az előfizetés-kezelés változatlan. |
| Árak oldal | `components/billing/PricingPage.tsx` | AAM-megjegyzés csak akkor, ha `INVOICE_VAT_KEY_HU=AAM` be van állítva; „csak magyar számlázási cím”; számlázási adatok szükségessége. |
| Számlázási teendők | `lib/server/invoicing.ts`, `lib/invoicing/jobs.ts`, `invoices` tábla | Minden fizetett Stripe-számla (összeg > 0), visszatérítés és elvesztett vita egy `manual` állapotú teendő. Egyedi `operation_key`, így az újraküldött esemény nem hoz létre másodikat. Csak azonosítók, összeg, pénznem és állapot – vevőadat és számlatartalom nincs. |
| Operátori eszköz | `scripts/invoices.ts` | `npm run invoices -- list manual` (nyitott teendők), `npm run invoices -- mark-issued <id> <számlaszám> [áfakulcs]`. |
| Napi cron | `app/api/cron/daily/route.ts`, `vercel.json` | Csak a megőrzési szabályok; beállítás nélkül semmit sem töröl. `CRON_SECRET` nélkül mindent elutasít. |
| Adatexport, törlés | `lib/server/account.ts` | Az export tartalmazza a jogi nyilatkozatokat és a számlateendőket. Fióktörléskor a számlateendők megmaradnak (`user_id` → NULL). |
| Jogi szövegek | `lib/legal/content.ts` | Dokumentumverzió; számlázási adatok; AI-hozzájárulás; megőrzés „a számviteli jogszabályokban előírt ideig”; ÁSZF-elfogadás; panaszkezelés. |
| Biztonsági fejlécek | `next.config.ts` | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`. |

## 2. Környezeti változók (csak nevek)

| Név | Kötelező | Jelentés |
| --- | --- | --- |
| `SALES_COUNTRIES` | nem (alap: `HU`) | Engedélyezett számlázási országok. |
| `EU_SALES_ENABLED` | nem (alap: ki) | `true` nélkül más EU-ország nem engedélyezhető. **Maradjon ki**, amíg az EU-s adó- és számlázási kezelés nincs jóváhagyva. |
| `INVOICE_VAT_KEY_HU` | nem | A jóváhagyott magyar adókezelés (pl. `AAM`); csak az árak oldalán megjelenő megjegyzést kapcsolja. A fizetést nem blokkolja. |
| `INVOICE_VAT_KEY_<CC>` | EU-országonként | Minden további országhoz külön, jóváhagyott kulcs. |
| `CRON_SECRET` | a cronhoz | A Vercel ezt küldi `Authorization: Bearer` fejlécben. |
| `AI_CONSENT_MODE` | nem (alap: kötelező) | `not_required` csak jogászi jóváhagyás után. |
| `RETENTION_*_DAYS` | nem | Megőrzési napok (`lib/retention/policy.ts`); beállítás nélkül nincs törlés. |

`INVOICING_MODE` és `SZAMLAZZ_*` nincs használatban; a beállításuk nem változtat semmin.

## 3. Stripe-beállítások (Dashboard)

1. Webhook-végpont: `https://www.berripop.com/api/stripe/webhook`. A meglévő eseményeken túl legyen bekapcsolva: `invoice.paid`, `charge.refunded`, `charge.dispute.closed` (lista: `HANDLED_EVENTS`, `lib/billing/webhook.ts`).
2. Nincs Stripe Tax, nincs adósor.
3. A Stripe e-mailes nyugtái/számlái a könyvelővel egyeztetve maradhatnak vagy kikapcsolhatók; **nem helyettesítik** a kézi számlát.

## 4. Migráció (0007) – csak jóváhagyással

- SQL: `drizzle/0007_legal_and_invoicing.sql` – két új tábla (`legal_records`, `invoices`), idegen kulcsok, indexek. Meglévő táblát nem módosít, adatot nem töröl. Az `invoices` tábla néhány oszlopa (`attempts`, `locked_until`, `next_attempt_at`) a későbbi integrációnak van fenntartva, most nem használt.
- **Az új kódot csak a migráció után szabad élesíteni**, különben a bejelentkezett tagok betöltési hibát kapnak.
- Mentés: futtatás előtt Neon-ág vagy point-in-time restore pont. Visszaállítás: a két tábla eldobása, amíg nincs bennük éles adat.
- Futtatás: `ALLOW_PRODUCTION_DB=1 npm run db:migrate`.

## 5. Ideiglenes kézi számlázási folyamat

1. Sikeres fizetés után a webhook `manual` állapotú teendőt rögzít (`kind = invoice`).
2. Az operátor naponta: `npm run invoices -- list manual`.
3. A Stripe Dashboardon a `stripeInvoiceId` alapján megnézi a vevő nevét, számlázási címét, a fizetés dátumát és összegét.
4. Kiállítja a számlát a választott számlázóprogramban (a könyvelő által jóváhagyott adókezeléssel és teljesítési dátummal).
5. Rögzíti: `npm run invoices -- mark-issued <id> <számlaszám> [áfakulcs]`.
6. Visszatérítésnél (`kind = storno`, teljes) vagy részleges visszatérítésnél / elvesztett vitánál (`kind = correction`) a megfelelő bizonylatot ugyanígy kézzel kell kiállítani és rögzíteni.
7. Ha a vevő számlázási címe nem magyar, az automatikusan nem szűrhető ki fizetés után: a teendőnél ezt is ellenőrizni kell.

> A választott számlázóprogramot (ha az adatfeldolgozó) fel kell venni az Adatkezelési tájékoztató adatfeldolgozói közé.

## 6. Indulási blokkolók (fizetős indulás előtt)

- Könyvelő: a kézi számlázás folyamata, az adókezelés (AAM), a teljesítési dátum, a sztornó és a helyesbítés rendje.
- Jogász: AI-hozzájárulás szövege, ÁSZF-elfogadás, panaszkezelés, elállási jog (nincs lemondó nyilatkozat), békéltető testület.
- A számlázóprogram feltüntetése adatfeldolgozóként.
- Mentés és a 0007-es migráció; a Stripe webhook-események bekapcsolása; Stripe tesztmódú vásárlás.
- Push és deploy (külön jóváhagyással).

**Az alkalmazás addig nem áll készen a fizetős indulásra, amíg a kézi számlázás folyamata és az adókezelés nincs megerősítve.**

## 7. Szándékosan nem része ennek a változatnak

- Számlázz.hu vagy más számlázó API hívása; automatikus számla, sztornó vagy helyesbítő számla.
- EU-értékesítés (kikapcsolva).
- Content-Security-Policy (Clerk, Google Fonts és Vercel Analytics miatt tesztelt engedélylista kell).
- Az ÁSZF-kapu szerveroldali érvényesítése az összes actionre (most a felületen érvényesül).
