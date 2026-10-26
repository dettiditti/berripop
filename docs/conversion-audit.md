# Berripop – ingyenes út és Premium-konverzió: audit és terv

Dátum: 2026-10-25. Forrás: a jelenlegi kód (nem terv vagy koncepció).

## 1. Mi működik ténylegesen

| Funkció | Free | Premium | Forrás |
|---|---|---|---|
| Aktív fejlődési célok | 1 | 5 | `PLAN_LIMITS`, `canCreateGrowthGoal` |
| Privát napló (írás, piszkozat, export, törlés) | ✓ | ✓ | `lib/server/journal.ts` |
| Napló AI-reflexió (kérésre) | 3 / hét | 40 / hét | `journal` keret |
| AI-segítség (továbbgondoló kérdés + köri összefoglaló) | 5 / hét | 60 / hét | `assist` keret |
| Heti köri fejlődési összefoglaló | – | ✓ | `canAccessWeeklySummary` |
| Heti napló-összefoglaló | – | ✓ | `canAccessWeeklyJournal` |
| Mentett gondolatok a reflexióban (opt-in) | – | ✓ | `insightContext` |
| Saját körök (csatlakozás korlátlan) | 1 | 5 | `canOwnAnotherCircle` |
| Napi kérdés, 21 napos út, XP | csak körben | csak körben | `lib/content.ts` |

Ár (megerősítve): Premium 2 990 Ft/hó (`kozos_premium_monthly_huf`), 23 990 Ft/év (`kozos_premium_annual_huf`), `lib/billing/plans.ts`. Stripe teszt mód, webhook él.

**Csak terv (nem ígérhető):** AI által készített személyes útvonal, Our Path, AI-beszélgetés, személyes napi kihívás.

## 2. Hol akad el a felhasználó (a legnagyobb konverziós problémák)

1. **A személyes tér zsákutca.** „Elindítom a saját utamat” után egy célkezelő jelenik meg: nincs első feladat, nincs visszajelzés, nincs következő lépés. A napló külön fülön van, a cél és a napló nincs összekötve.
2. **A legerősebb ingyenes élmény (AI-reflexió) rejtve marad.** Csak akkor jelenik meg, ha a felhasználó magától ír egy bejegyzést.
3. **Az ajánlatok nem vezetnek fizetéshez.** Az `UpgradePrompt` csak a `/pricing` oldalra visz, árat nem mutat, és ha egyszer elutasítják, örökre eltűnik.
4. **A személyes térben nem látszik a csomag állapota.** A csomag, a felhasznált AI-keret, a számlázás kezelése és a lemondás csak a körös alkalmazás Profil fülén érhető el. Kör nélküli felhasználó nem látja.
5. **Hiányzik a mérés a funnel elejéről.** A `funnel_events` csak a fizetési szakaszt méri (pricing, prompt, checkout, lemondás). Regisztrációt, első célt, első gyakorlatot nem.

## 3. Javasolt megoldások (prioritás szerint)

| # | Megoldás | Épít rá | Kód / DB |
|---|---|---|---|
| P1 | **„Első lépések” vezetett folyamat** a személyes térben: 1) cél kiválasztása egy kattintással, 2) 3 perces első gyakorlat a naplóban, a célhoz kötött kérdéssel, 3) visszajelzés: AI-reflexió a bejegyzésre, 4) hogyan tovább (holnapi írás, közös kör, Premium-előnyök). Haladásjelzővel. | célok, napló, AI-reflexió | csak UI, nincs migráció |
| P2 | **Kontextusos Premium-ajánlat árral és közvetlen checkouttal**: a meglévő `UpgradePrompt` mutassa a konkrét előnyt, a valós árat (2 990 Ft/hó), a megújulás tényét, és indítsa a meglévő Stripe checkoutot. Mellette az összehasonlító oldal linkje. A limitnél (`force`) mindig megjelenik. | `startCheckoutAction`, `PRICES` | csak UI |
| P3 | **Csomagállapot a személyes térben** (a meglévő `SubscriptionCard`): csomag, heti AI-keret, számlázás kezelése, lemondás. | `SubscriptionCard` | csak UI |
| P4 | **Funnel-események**: `signup_completed`, `first_goal_created`, `first_entry_saved` (= első gyakorlat), `first_reflection_received`. A meglévők: `upgrade_prompt_shown`, `pricing_viewed`, `checkout_started`, `checkout_completed`. | `funnel_events`, `track()` | szerveroldali, nincs migráció (szöveges eseménynév) |
| P5 (javaslat, jóváhagyásra) | Személyes napi kérdés a meglévő kérdéstárból; ingyenes próbaidőszak a Stripe-ban; egy csak Premiumban elérhető mélyebb funkció (például a My Path AI-útvonal). | – | árazási vagy termékdöntés |

**Nem változik:** az árak, a limitek, a Stripe-termékek, a webhook, a billing-logika, a Clerk és az adatbázis-séma.

**Elvek:** nincs hamis sürgetés, nincs kitalált leárazás, nincs „korlátlan” ígéret. Ajánlat csak döntési ponton jelenik meg: limitnél, zárt funkciónál, és az első lépések végén egyszer.

## 4. Megvalósítva (2026-10-25)

- **P1:** `components/FirstSteps.tsx`, a személyes tér „Céljaim” fülén. Lépései:
  - cél egy kattintással;
  - az első gyakorlat a naplóban nyílik meg, a célhoz kötött kérdéssel;
  - „Visszajelzést kérek”: AI-reflexió, a meglévő heti kereten belül;
  - „Hogyan tovább”.
- **P2:** `components/billing/UpgradePrompt.tsx`. Megmutatja a konkrét előnyt, a valós árat (`PRICES.monthly`) és a megújulást, és elindítja a meglévő `startCheckoutAction("month")`-t. Mellette az összehasonlító oldal linkje. A `force` ajánlat nem rejthető el. Minden meglévő döntési pont ezt használja: célkorlát, AI-keret, napló-keret, heti összefoglaló, körkorlát. Új döntési pont: az első lépések végén.
- **P3:** a `SubscriptionCard` a személyes térben is megjelenik.
- **P4:** új események: `signup_completed`, `first_goal_created`, `first_entry_saved`, `first_reflection_received`. Csak az esemény neve kerül tárolásra, szöveg soha.
- **P5:** nincs megvalósítva, döntésre vár.
