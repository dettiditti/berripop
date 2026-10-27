# Jogi oldalak: nyitott kérdések

Állapot: 2026. október 27. A nyilvános jogi oldalak (`/privacy`, `/terms`, `/cookies`, `/contact`,
szöveg: `lib/legal/content.ts`) már nem tartalmaznak belső jegyzetet vagy helyőrzőt, és minden
állításukat a kóddal vetettük össze. **Jogász vagy könyvelő még nem ellenőrizte őket.** Az alábbi
kérdéseket nem lehetett a projektből eldönteni; a szöveget ezek lezárása után kell véglegesíteni.

## Jogásznak

### Magas prioritás

1. **Különleges adatok és az AI jogalapja.** A naplóbejegyzések és válaszok lelkiállapotra,
   egészségre vonatkozó adatot is tartalmazhatnak (GDPR 9. cikk). A tájékoztató jelenleg a
   szolgáltatásnál és az AI-funkcióknál is szerződés teljesítését jelöli meg jogalapként. El kell
   dönteni, kell-e kifejezett hozzájárulás (a napló használatához és/vagy az AI-feldolgozáshoz), és ha
   igen, hogyan kérjük be az alkalmazásban.
2. **Elállási jog (45/2014. Korm. rendelet).** Digitális szolgáltatásnál a 14 napos elállási jog csak
   a fogyasztó kifejezett beleegyezésével és tudomásulvételével zárható ki, ha a szolgáltatás azonnal
   indul. A Stripe-fizetés előtt jelenleg nincs ilyen beleegyezés. Ki kell dolgozni a tájékoztatást és
   a fizetési folyamat lépését, majd a Felhasználási feltételekbe írni.
3. **Fogyasztói panaszkezelés és jogviták.** A feltételekből hiányzik a békéltető testület (neve,
   címe) és a panaszkezelés rendje. A „magyar jog az irányadó” mondat fogyasztóknál nem
   korlátozhatja a lakóhely szerinti kötelező védelmet (Róma I, 6. cikk). A pontos szöveg jogászi döntés.
4. **Felelősség.** A Felelősség szakaszt eltávolítottuk, mert csak jegyzet volt benne. A
   felelősségkorlátozás szövege jogászi feladat.
5. **A feltételek elfogadása.** Nem ellenőrizhető a kódból, hogy a regisztrációkor a felhasználó
   elfogadja-e a feltételeket (Clerk-beállítás). Ha nem, meg kell oldani.

### További kérdések

6. **Hatálybalépés.** A „Hatályos: a közzététel napja” helyett most „Utolsó módosítás: 2026. október 27.”
   szerepel, ami a szöveg tényleges utolsó változása. Hatálybalépési dátum és verziókezelés kell-e?
7. **Jogos érdek.** Érdekmérlegelési teszt a tartalom nélküli termékeseményekhez (például az
   alkalmazás napi megnyitása) és a biztonsági naplózáshoz.
8. **Adatfeldolgozói szerződések (DPA).** Szolgáltatónként ellenőrizni kell, hogy a DPA létrejött-e
   (Vercel, Neon, Clerk, Stripe, OpenAI, Google). Az erről szóló mondatot eltávolítottuk, mert nem volt
   ellenőrizve.
9. **Adattovábbítás az USA-ba.** A szöveg szerint a továbbítás az EU–USA adatvédelmi keretrendszer vagy
   SCC alapján történik, az adott szolgáltató feltételei szerint. Szolgáltatónként meg kell erősíteni,
   melyik garancia vonatkozik rájuk.
10. **AI és modelltanítás.** A korábbi „a szolgáltató nem használja ezeket az adatokat modelltanításra”
    mondatot eltávolítottuk, mert a kódból nem igazolható. A Vercel és az OpenAI feltételeinek
    ellenőrzése után vissza lehet tenni.
11. **Megőrzési idők.** Az AI-használati napló a fiók törléséig marad meg. A termékesemények és a köri
    tevékenységnapló a fiók törlése után fiókhoz nem kapcsolva, időkorlát nélkül maradnak meg. Kell-e
    megőrzési idő, és anonimnak tekinthetők-e a leválasztott események (időpont, csomag)?
12. **Értesítés változáskor.** Jelentős változásnál kell-e e-mailes értesítés?
13. **Felhasználási szabályok.** Tiltott tartalmak és felhasználás részletezése; a szolgáltató általi
    felfüggesztés vagy megszüntetés feltételei; a feltételek módosításának rendje; méltányos
    használat (az AI-keretek számai a kódban: `PLAN_LIMITS`).
14. **Sütik.** Megerősítendő, hogy csak a működéshez szükséges sütik miatt nem kell hozzájárulási ablak.
    A Google Fonts betöltésekor a Google megkapja a látogató IP-címét; ezt a tájékoztató most leírja.
    A betűtípusok saját tárhelyről is kiszolgálhatók (technikai döntés).
15. **Korhatár.** A szöveg szerint a Berripop 16 év alatt nem használható, de a regisztrációnál nincs
    korellenőrzés. Elég-e így?

## Könyvelőnek

1. **Áfa.** Alanyi adómentes-e a vállalkozás, vagy áfakörös? Ettől függ, hogyan kell feltüntetni az
   árakat (bruttó ár, „AAM”), és mi kerül a számlára. A feltételek most csak a forintárakat írják.
2. **Számlázás.** Megfelel-e a Stripe által kiállított számla a magyar számlázási szabályoknak (NAV
   online számla adatszolgáltatás), vagy kell számlázóprogram-integráció (például Számlázz.hu, Billingo)?
3. **Bizonylatok megőrzése.** A korábbi „legalább 8 évig megőrizzük” mondatot eltávolítottuk: a
   fizetési adatokat a Stripe tárolja, a saját adatbázisunkban nincs pénzügyi bizonylat. Ki és hogyan
   teljesíti a számviteli megőrzési kötelezettséget?

## Eltávolított belső jegyzetek

| Hol | Jegyzet | Mi lett vele |
| --- | --- | --- |
| Minden oldal | „Tervezet” sáv | Korábban eltávolítva |
| Minden oldal | `[[a közzététel napja]]` | „Utolsó módosítás: 2026. október 27.” (6. pont) |
| Adatkezelés, jogalapok | `[[szükséges-e külön hozzájárulás]]` | Jegyzet törölve (1. pont) |
| Adatkezelés, jogalapok | `[[érdekmérlegelési teszt elkészítése]]` | Jegyzet törölve, a tiltakozás joga a szövegbe került (7. pont) |
| Adatkezelés, adatfeldolgozók | `[[DPA elfogadásának ellenőrzése]]` | A nem ellenőrzött mondattal együtt törölve (8. pont) |
| Adatkezelés, adattovábbítás | `[[melyik garancia vonatkozik rájuk]]` | Jegyzet törölve (9. pont) |
| Adatkezelés, megőrzés | `[[megőrzési idő meghatározása]]` | A szöveg a tényleges működést írja le (11. pont) |
| Adatkezelés, módosítás | `[[e-mailes értesítés szükségessége]]` | Jegyzet törölve (12. pont) |
| Feltételek, tartalom | `[[tiltott tartalmak]]` | Jegyzet törölve (13. pont) |
| Feltételek, előfizetés | `[[áfatartalom; elállási jog]]` | Jegyzet törölve (2. pont; könyvelő 1. pont) |
| Feltételek, AI | `[[méltányos használat szabályai]]` | A keretek csomagfüggők, az Árak oldalra mutat (13. pont) |
| Feltételek, megszüntetés | `[[felfüggesztés feltételei]]` | A szakasz csak a fióktörlést írja le (13. pont) |
| Feltételek, Felelősség | `[[felelősségkorlátozás]]` | Szakasz eltávolítva (4. pont) |
| Feltételek, jogviták | `[[békéltető testület, bíróság]]` | Panasz e-mail-címe megadva, a többi nyitott (3. pont) |
| Cookie, külső tartalom | `[[saját tárhelyre költöztetés]]` | Jegyzet törölve, IP-továbbítás leírva (14. pont) |
| Cookie, hozzájárulás | `[[jogi ellenőrzés]]` | Jegyzet törölve (14. pont) |

## A kóddal összevetett tények (ha változnak, a szöveget is frissíteni kell)

- Bejelentkezés: Clerk, e-mail vagy Google; a saját adatbázis csak a fiókazonosítót és a megjelenített nevet tárolja (`users`).
- Fióktörlés: a Clerk-fiókot és minden személyes tartalmat töröl; megújuló előfizetésnél előbb le kell mondani (`lib/account/policy.ts`); a `funnel_events` és a `circle_events` sorai fiókhoz nem kapcsolva maradnak meg (`lib/server/account.ts`).
- Adatletöltés: JSON (`exportAccount`).
- AI: OpenAI a Vercelen keresztül, csak kérésre; a funkciók: napló-reflexió, heti naplóösszefoglaló, továbbgondoló kérdés, heti összefoglaló, felmérés, célút. Az `ai_calls` nem tárol szöveget. Ha az `AI_GATEWAY_MODEL` nem OpenAI-modellre vált, az adatfeldolgozók listáját frissíteni kell.
- Adatbázis: Neon, us-east-1 (a 2026-10-25-i audit szerint).
- Stripe: árak és csomagok a `lib/billing/plans.ts` szerint; lemondás az időszak végén, csomagváltás időarányos különbözettel (`scripts/stripe-setup.ts`).
- Sütik és localStorage: `kozos-locale` süti (1 év), Clerk-sütik; localStorage-kulcsok a Cookie-tájékoztató szerint. Vercel Web Analytics süti nélkül.
- A `tests/legal.test.ts` ellenőrzi, hogy nincs helyőrző, a két nyelv szerkezete egyezik, és az árak és az ingyenes keretek egyeznek a kóddal.

## Frissítés (2026. október 27., még nem élesített kód)

- **Jogász 1. (AI jogalap):** a kód mostantól külön, visszavonható AI-hozzájárulást kér (`AI_CONSENT_MODE`, alapból kötelező), a tájékoztató ezt jelöli jogalapnak. A szöveg jogászi jóváhagyásra vár.
- **Jogász 2. (elállás):** továbbra is nyitott; a lemondó nyilatkozat nincs bekapcsolva, a szöveg csak annyit mond, hogy a fizetős funkciók azonnal elérhetők.
- **Jogász 3. (panasz):** panaszkezelési szakasz került a feltételekbe (e-mail, posta), határidő és békéltető testület nélkül.
- **Jogász 5. (elfogadás):** az alkalmazás az első használat előtt és verzióváltáskor kéri a feltételek elfogadását, verzióval és időponttal rögzítve.
- **Könyvelő 1–3.:** a Számlázz.hu-integráció el van halasztva. Minden fizetésről kézi számlázási teendő keletkezik; a számlát kézzel kell kiállítani. A Stripe-bizonylatokat nem tekintjük számlának. A kézi folyamatot és az adókezelést a könyvelőnek kell megerősítenie. Részletek: `docs/production-readiness.md`.
