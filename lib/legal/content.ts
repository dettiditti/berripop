import type { Locale } from "../i18n/config";

/**
 * Public legal texts (Hungarian and English), written from what the app
 * actually does (checked against the code on 2026-10-27): Clerk sign-in
 * (email or Google), Neon database (us-east-1), Vercel hosting, OpenAI via
 * Vercel, Stripe payments and Customer Portal, first-party product events
 * (`funnel_events`, unlinked on account deletion), cookieless Vercel Web
 * Analytics, Google Fonts, no analytics or advertising cookies.
 *
 * Operator details come from the owner. NOT legally reviewed: the open legal and
 * accounting questions are listed in docs/legal-open-questions.md. Keep every
 * statement here true to the code; no internal notes or placeholders, since all
 * of it is shown publicly (tests/legal.test.ts checks this).
 */

export type LegalSection = { heading: string; body?: string[]; list?: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };
export type LegalKind = "privacy" | "terms" | "cookies" | "contact";

type LegalSet = {
  back: string;
  updated: string;
  /** Internal document version (lib/legal/records.ts), shown under the date. */
  version: string;
  docs: Record<LegalKind, LegalDoc>;
  nav: Record<LegalKind, string>;
};

const hu: LegalSet = {
  back: "Vissza a Berripophoz",
  updated: "Utolsó módosítás: 2026. október 27.",
  version: "Dokumentumverzió: {v}",
  nav: { privacy: "Adatkezelési tájékoztató", terms: "Felhasználási feltételek", cookies: "Cookie-tájékoztató", contact: "Kapcsolat" },
  docs: {
    privacy: {
      title: "Adatkezelési tájékoztató",
      intro: "Ez a tájékoztató leírja, milyen adatokat kezel a Berripop, mire használja őket, kik dolgozzák fel őket, és milyen jogaid vannak.",
      sections: [
        { heading: "Az adatkezelő", list: ["Adatkezelő: Bujákné Novák Bernadett egyéni vállalkozó", "Nyilvántartási szám: 58034914", "Adószám: 59982944-1-42", "Székhely: 1151 Budapest, Sződliget utca 11.", "E-mail: novakbernadett94@gmail.com", "Honlap: www.berripop.com"], body: ["Az adatkezelő a személyes adatokat a vonatkozó jogszabályok, különösen az Európai Parlament és a Tanács (EU) 2016/679 rendelete (GDPR) szerint kezeli."] },
        { heading: "Milyen adatokat kezelünk", list: [
          "Fiókadatok: az e-mail-címed, és ha megadod, a neved. Google-bejelentkezésnél a Google által átadott név, e-mail-cím és profilkép. Ezeket a bejelentkezést kezelő Clerk tárolja; a saját adatbázisunkban a fiókazonosítód és a megjelenített neved szerepel.",
          "Profil és beállítások: megjelenített név, a választott nyelv.",
          "Az általad létrehozott tartalom: fejlődési célok és lépések, a céljaidból összeállított 21 napos utak, a kezdeti felmérés válaszai és a személyes terv, naplóbejegyzések, AI-reflexiók és az azokra adott visszajelzéseid, mentett gondolatok, a saját utad és a köri válaszaid, a Belső világ pillanatai (választott szavak és jegyzet), reakciók és saját kérdések.",
          "Haladás: teljesített utazásnapok és napi kérdések dátuma, XP, jelvények. Ezek nem tartalmaznak szöveget, csak azt, hogy mit és mikor teljesítettél.",
          "Körök: tagság és szerep, valamint a kör tevékenységnaplója (például ki csatlakozott vagy ki válaszolt), válaszszöveg nélkül. A köri válaszaidat a kör tagjai csak akkor látják, ha megosztod őket.",
          "Előfizetés: csomag, állapot, számlázási időszak vége és a Stripe-ügyfélazonosító. A bankkártya-adatokat kizárólag a Stripe kezeli, mi nem látjuk őket.",
          "Számlázási adatok: a fizetéskor a Stripe-nál megadott neved, számlázási címed és e-mail-címed, amelyekkel a számlát kiállítjuk. A saját adatbázisunkban a számlák azonosítóját, összegét, állapotát és sorszámát tároljuk.",
          "Nyilatkozatok: a Felhasználási feltételek elfogadása és az AI-feldolgozáshoz adott vagy visszavont hozzájárulás, a szöveg verziójával és az időponttal; valamint az, hogy a fizetés előtt melyik tájékoztató-változatot láttad.",
          "AI-használat: funkció, modell, tokenszám, becsült költség és időpont. A kérések és válaszok szövegét ebben a naplóban nem tároljuk.",
          "Termékesemények: például regisztráció, első cél, az alkalmazás napi megnyitása vagy előfizetés indítása. Az esemény neve és időpontja, és ahol releváns, a csomag és az alkalmazásnak az a része, ahol történt. Tartalmat nem tárolunk benne.",
          "Technikai adatok: a tárhely- és bejelentkezési szolgáltatók a működéshez és a biztonsághoz naplózhatnak IP-címet, böngésző- és eszközadatokat.",
        ] },
        { heading: "Mire használjuk és milyen jogalapon", list: [
          "A fiók létrehozása és a szolgáltatás nyújtása (célok, napló, körök, felmérés). Jogalap: szerződés teljesítése (GDPR 6. cikk (1) b) pont).",
          "AI-funkciók, kizárólag a kifejezett kérésedre és a külön hozzájárulásod alapján. Jogalap: hozzájárulás (GDPR 6. cikk (1) a) pont, és ha a szöveg különleges adatot tartalmaz, 9. cikk (2) a) pont). A hozzájárulást bármikor visszavonhatod a Beállításokban.",
          "Előfizetés a Stripe-on keresztül és a számla kiállítása. Jogalap: szerződés teljesítése és jogi kötelezettség (GDPR 6. cikk (1) b) és c) pont).",
          "A rendszer biztonsága, a hibák javítása és a termék fejlesztését segítő, tartalom nélküli mérés. Jogalap: jogos érdek (GDPR 6. cikk (1) f) pont). Ez ellen bármikor tiltakozhatsz.",
        ] },
        { heading: "AI-feldolgozás", body: [
          "Ha AI-funkciót kérsz (napló-reflexió, heti naplóösszefoglaló, továbbgondoló kérdés, heti összefoglaló a válaszaidról, a kezdeti felmérés, a céljaidhoz tartozó 21 napos út összeállítása), az ehhez szükséges szöveget a Vercel továbbítja az OpenAI nyelvi modelljéhez. Kérés nélkül semmilyen tartalmad nem kerül AI-hoz.",
          "Az AI-funkciókat csak akkor használhatod, ha a Beállításokban külön hozzájárulsz az AI-feldolgozáshoz. A hozzájárulás önkéntes, nélküle a többi funkció elérhető. Visszavonás után nem küldünk több tartalmat AI-hoz; a visszavonás nem érinti a korábbi feldolgozás jogszerűségét, és a már elkészült reflexiók addig maradnak meg, amíg nem törlöd őket.",
          "Az AI által készített reflexiókat, terveket és utakat a fiókodban tároljuk. A napló-reflexiók a hozzájuk tartozó bejegyzéssel együtt, a többi a fiókod törlésével törlődik.",
          "A Berripop az elmélyülést segíti, nem állít fel diagnózist, és nem helyettesíti a szakmai segítséget.",
        ] },
        { heading: "Adatfeldolgozók", list: [
          "Vercel Inc.: tárhely, az AI-kérések továbbítása és a süti nélküli látogatottság-mérés.",
          "Neon: adatbázis. Az adatok jelenleg az USA keleti régiójában (us-east-1) tárolódnak.",
          "Clerk: azonosítás és bejelentkezés, valamint a belépéshez szükséges e-mailek (például megerősítő kódok) küldése.",
          "Stripe: fizetés és előfizetés-kezelés.",
          "OpenAI: AI-válaszok.",
          "Google: Google-bejelentkezés (ha ezt választod), valamint a betűtípusok betöltése a Google Fonts szolgáltatásból.",
        ] },
        { heading: "Adattovábbítás az EGT-n kívülre", body: ["Több szolgáltató (Vercel, Neon, Clerk, Stripe, OpenAI, Google) az Egyesült Államokban is kezel adatot, és az adatbázisunk is ott található. A továbbítás az EU által elismert garanciák, az EU–USA adatvédelmi keretrendszer vagy az Európai Bizottság általános szerződési feltételei (SCC) alapján történik, az adott szolgáltató feltételei szerint."] },
        { heading: "Meddig őrizzük az adatokat", body: [
          "A fiókodat és a tartalmaidat addig őrizzük, amíg nem törlöd őket vagy a fiókodat. A naplóbejegyzések egyenként és egyben is törölhetők.",
          "Az AI-használati adatokat a fiók törléséig őrizzük. A termékeseményeket és a körök tevékenységnaplóját a fiók törlésekor leválasztjuk a fiókodról: ezután a fiókodhoz nem kapcsolva, összesített statisztikához maradnak meg.",
          "A számlákat és a kiállításukhoz szükséges adatokat a számviteli jogszabályokban előírt ideig őrizzük, a fiók törlése után is, a fiókhoz nem kapcsolva. A Stripe a fizetési adatokat a saját feltételei és a jogszabályok szerint is tárolja; a Berripop-fiók törlése ezeket nem törli.",
          "A Feltételek elfogadásáról és az AI-hozzájárulásról szóló nyilvántartást a fiók törléséig őrizzük.",
        ] },
        { heading: "A jogaid", list: [
          "Hozzáférés és adathordozhatóság: Beállítások → „Adataim letöltése” (JSON-fájl).",
          "Helyesbítés: a nevedet és a tartalmaidat az alkalmazásban szerkesztheted.",
          "Törlés: Beállítások → „Fiók törlése”. Ez a bejelentkezési fiókodat és a tartalmaidat is véglegesen törli. Ha megújuló előfizetésed van, előbb azt kell lemondanod. A saját köreidet a legrégebbi másik tag kapja meg; ha nincs más tag, a kör is törlődik.",
          "Az adatkezelés korlátozása és tiltakozás: kérheted az adatkezelés korlátozását, és tiltakozhatsz a jogos érdeken alapuló adatkezelés ellen. Írj a novakbernadett94@gmail.com címre.",
          "Hozzájárulás visszavonása: ha egy adatkezelés hozzájáruláson alapul, azt bármikor visszavonhatod. Ez a korábbi, jogszerű adatkezelést nem érinti.",
        ] },
        { heading: "Jogorvoslat", list: [
          "Nemzeti Adatvédelmi és Információszabadság Hatóság (NAIH): 1055 Budapest, Falk Miksa utca 9–11., naih.hu",
          "Bírósági eljárást is indíthatsz a lakóhelyed vagy tartózkodási helyed szerint illetékes törvényszék előtt.",
        ] },
        { heading: "Gyermekek", body: ["A Berripop 16 éven aluliak számára nem használható, és tudatosan nem gyűjtünk 16 év alattiakra vonatkozó személyes adatot. Ha ilyen adat a tudomásunkra jut, indokolatlan késedelem nélkül töröljük."] },
        { heading: "Biztonság", body: ["A kapcsolat titkosított (HTTPS). A hozzáférést a szerver minden kérésnél ellenőrzi. Privát tartalmaidat (napló, válaszok) csak te látod, amíg nem osztod meg őket."] },
        { heading: "Kapcsolat és a tájékoztató módosítása", body: ["Adatkezeléssel kapcsolatos kérdés vagy kérelem esetén írj a novakbernadett94@gmail.com címre.", "A tájékoztató módosításáról ezen az oldalon adunk tájékoztatást, az utolsó módosítás dátumának frissítésével."] },
      ],
    },
    terms: {
      title: "Felhasználási feltételek",
      intro: "Ezek a feltételek a Berripop használatára vonatkoznak.",
      sections: [
        { heading: "A szolgáltató", list: ["Bujákné Novák Bernadett egyéni vállalkozó", "Nyilvántartási szám: 58034914", "Adószám: 59982944-1-42", "Székhely: 1151 Budapest, Sződliget utca 11.", "E-mail: novakbernadett94@gmail.com"] },
        { heading: "A szolgáltatás", body: ["A Berripop személyes és közös fejlődést segítő alkalmazás: célok, napi kérdések, napló, körök és AI-alapú visszajelzések. Nem orvosi, pszichológiai vagy terápiás szolgáltatás, és nem állít fel diagnózist. Krízishelyzetben hívd a 112-es segélyhívó számot."] },
        { heading: "Fiók", body: ["A regisztrációhoz és a bejelentkezéshez a Clerk szolgáltatást használjuk. A fiókod biztonságáért te felelsz. A Berripop 16 éven aluliak számára nem használható.", "A feltételeket az alkalmazás első használata előtt fogadod el. Ha a feltételek módosulnak, a folytatáshoz az új változatot is el kell fogadnod. Az elfogadás időpontját és a feltételek verzióját rögzítjük."] },
        { heading: "A tartalmaid", body: ["Az általad létrehozott tartalom a tiéd. A köri válaszaidat csak akkor látják a kör tagjai, ha megosztod őket. Ne ossz meg olyat, ami mások jogait sérti."] },
        { heading: "Csomagok és előfizetés", list: [
          "Ingyenes csomag: 1 aktív cél, 1 saját kör, hetente 5 AI-segítség és 3 napló-reflexió.",
          "Premium: 2 990 Ft/hó vagy 23 990 Ft/év. Premium Plus: 3 990 Ft/hó vagy 31 990 Ft/év. Mindkettő automatikusan megújul, amíg le nem mondod.",
          "Csomagváltás (Premium és Premium Plus között): a számlázási portálon, ahol terhelés előtt látod az időarányos különbözetet.",
          "A fizetős csomagok is heti AI-keretekkel működnek; egyik csomag sem korlátlan. Az aktuális keretek az Árak oldalon láthatók.",
          "Lemondás: bármikor a számlázási portálon (Beállítások → Előfizetésem). A csomagod a kifizetett időszak végéig aktív marad.",
          "A fizetést a Stripe kezeli; a bankkártya-adataidat mi nem látjuk.",
          "A fizetéshez meg kell adnod a nevedet és a számlázási címedet; a számlát ezekkel az adatokkal állítjuk ki. Előfizetni jelenleg magyarországi számlázási címmel lehet.",
          "A fizetős funkciók a sikeres fizetés után azonnal elérhetők.",
        ] },
        { heading: "AI-funkciók", body: ["Az AI-válaszok tájékoztató jellegűek, és tévedhetnek. Az AI-funkciókra csomagonként eltérő heti keretek vonatkoznak."] },
        { heading: "A fiók törlése", body: ["A fiókodat bármikor törölheted: Beállítások → „Fiók törlése”. Ha megújuló előfizetésed van, előbb azt kell lemondanod. A törlés végleges: a bejelentkezési fiókod és a tartalmaid törlődnek, és nem állíthatók vissza."] },
        { heading: "Panaszkezelés", body: ["Panaszodat e-mailben a novakbernadett94@gmail.com címre, vagy postán a szolgáltató fenti címére küldheted. Írd meg, mire vonatkozik a panasz, és add meg a Berripop-fiókodhoz tartozó e-mail-címet, hogy beazonosíthassuk."] },
        { heading: "Irányadó jog és kapcsolat", body: ["A feltételekre a magyar jog az irányadó. Kérdéseidet a novakbernadett94@gmail.com címre küldheted."] },
      ],
    },
    cookies: {
      title: "Cookie-tájékoztató",
      intro: "A Berripop csak a működéshez szükséges sütiket és böngészőben tárolt adatokat használja. Analitikai vagy hirdetési sütit nem használunk.",
      sections: [
        { heading: "Sütik", list: [
          "Clerk munkamenet-sütik: a bejelentkezés fenntartásához szükségesek.",
          "kozos-locale: a választott nyelv, hogy az oldalak már betöltéskor ezen a nyelven jelenjenek meg. Egy évig érvényes.",
          "A fizetési oldalon a Stripe a saját domainjén saját sütiket használhat.",
        ] },
        { heading: "A böngésződben tárolt adatok (localStorage)", list: [
          "kozos-locale: a választott nyelv.",
          "kozos-upgrade-dismissed:*: az általad elrejtett Premium-ajánlatok.",
          "berripop-first-steps-hidden: elrejtetted-e az „Első lépések” kártyát.",
          "kozos-prototype-v1: régebben itt tároltuk a Belső világ pillanatait. Bejelentkezés után egyszer áthelyezzük őket a fiókodba, majd töröljük innen.",
        ] },
        { heading: "Látogatottság mérése", body: ["Az oldalmegtekintéseket a Vercel Web Analytics méri, süti és böngészőben tárolt azonosító nélkül, összesítve. Nem követ más oldalakon, és nem azonosít téged."] },
        { heading: "Külső tartalom", body: ["A betűtípusokat a Google Fonts szolgáltatásból töltjük be, ezért a böngésződ kapcsolódik a Google szervereihez, és ennek során a Google megkapja az IP-címedet."] },
        { heading: "Hozzájárulás", body: ["Mivel csak a működéshez szükséges sütiket használjuk, nem jelenítünk meg süti-hozzájárulási ablakot."] },
      ],
    },
    contact: {
      title: "Kapcsolat",
      intro: "Kérdésed van, segítség kell, vagy az adataiddal kapcsolatban fordulnál hozzánk?",
      sections: [
        { heading: "Elérhetőség", list: ["E-mail (általános és adatvédelmi ügyek): novakbernadett94@gmail.com", "Postai cím: Bujákné Novák Bernadett egyéni vállalkozó, 1151 Budapest, Sződliget utca 11."] },
        { heading: "Gyakori kérések, amelyeket magad is elintézhetsz", list: [
          "Adataid letöltése: Beállítások → „Adataim letöltése”.",
          "Fiók törlése: Beállítások → „Fiók törlése”.",
          "Előfizetés lemondása, számlák és fizetési mód: Beállítások → Előfizetésem → „Számlázás kezelése”.",
        ] },
      ],
    },
  },
};

const en: LegalSet = {
  back: "Back to Berripop",
  updated: "Last updated: 27 October 2026",
  version: "Document version: {v}",
  nav: { privacy: "Privacy policy", terms: "Terms of service", cookies: "Cookie policy", contact: "Contact" },
  docs: {
    privacy: {
      title: "Privacy policy",
      intro: "This policy describes what data Berripop processes, what for, who processes it, and what your rights are.",
      sections: [
        { heading: "The controller", list: ["Controller: Bujákné Novák Bernadett, sole proprietor (egyéni vállalkozó)", "Registration number: 58034914", "Tax number: 59982944-1-42", "Registered address: Sződliget utca 11., 1151 Budapest, Hungary", "Email: novakbernadett94@gmail.com", "Website: www.berripop.com"], body: ["The controller processes personal data in line with applicable law, in particular Regulation (EU) 2016/679 (GDPR)."] },
        { heading: "What data we process", list: [
          "Account data: your email address and, if you provide it, your name. With Google sign-in, the name, email address and profile picture Google shares. These are stored by Clerk, which handles sign-in; our own database holds your account ID and display name.",
          "Profile and settings: display name, chosen language.",
          "Content you create: growth goals and steps, the 21-day journeys built from your goals, your initial assessment answers and personal plan, journal entries, AI reflections and your feedback on them, saved thoughts, answers on your own path and in circles, My Inner World moments (chosen words and a note), reactions and your own questions.",
          "Progress: dates of completed journey days and daily questions, XP and badges. These contain no text, only what you completed and when.",
          "Circles: membership and role, and the circle's activity log (for example who joined or who answered), without answer text. Circle members only see your circle answers if you share them.",
          "Subscription: plan, status, end of the billing period and your Stripe customer ID. Card details are handled only by Stripe; we never see them.",
          "Billing details: the name, billing address and email address you give Stripe at checkout, which the invoice is issued with. Our own database stores each invoice's ID, amount, status and number.",
          "Statements: your acceptance of the Terms of Use and the consent to AI processing you gave or withdrew, with the text version and time; and which notice version you saw before paying.",
          "AI usage: feature, model, token counts, estimated cost and time. This log doesn't store the text of requests or responses.",
          "Product events: for example sign-up, first goal, opening the app on a given day or starting a subscription. The event name and time and, where relevant, the plan and the part of the app where it happened. No content is stored in them.",
          "Technical data: hosting and sign-in providers may log IP addresses, browser and device data for operation and security.",
        ] },
        { heading: "Purposes and legal bases", list: [
          "Creating your account and providing the service (goals, journal, circles, assessment). Legal basis: performance of a contract (GDPR Art. 6(1)(b)).",
          "AI features, only when you explicitly ask and based on your separate consent. Legal basis: consent (GDPR Art. 6(1)(a) and, where the text includes special category data, Art. 9(2)(a)). You can withdraw it any time in Settings.",
          "Subscription via Stripe and issuing the invoice. Legal basis: contract and legal obligation (GDPR Art. 6(1)(b) and (c)).",
          "System security, fixing errors and content-free measurement to improve the product. Legal basis: legitimate interest (GDPR Art. 6(1)(f)). You can object to this at any time.",
        ] },
        { heading: "AI processing", body: [
          "When you ask for an AI feature (journal reflection, weekly journal summary, follow-up question, weekly summary of your answers, the initial assessment, building a 21-day journey for your goals), Vercel forwards the text it needs to an OpenAI language model. None of your content goes to an AI unless you ask.",
          "You can use AI features only after giving separate consent to AI processing in Settings. Consent is optional; everything else works without it. After you withdraw it, we send no more content to AI; withdrawal doesn't affect the lawfulness of earlier processing, and reflections already written stay until you delete them.",
          "The reflections, plans and journeys the AI creates are stored in your account. Journal reflections are deleted with their entry, the rest when you delete your account.",
          "Berripop supports reflection; it doesn't diagnose and doesn't replace professional help.",
        ] },
        { heading: "Processors", list: [
          "Vercel Inc.: hosting, forwarding AI requests and cookieless visitor statistics.",
          "Neon: database. Data is currently stored in the US East region (us-east-1).",
          "Clerk: authentication and sign-in, including the emails needed to sign in (e.g. verification codes).",
          "Stripe: payments and subscription management.",
          "OpenAI: AI responses.",
          "Google: Google sign-in (if you choose it), and loading fonts from Google Fonts.",
        ] },
        { heading: "Transfers outside the EEA", body: ["Several providers (Vercel, Neon, Clerk, Stripe, OpenAI, Google) also process data in the United States, where our database is also located. Transfers rely on safeguards recognised by the EU, the EU–US Data Privacy Framework or the European Commission's standard contractual clauses (SCC), under each provider's terms."] },
        { heading: "Retention", body: [
          "We keep your account and content until you delete them or your account. Journal entries can be deleted one by one or all at once.",
          "AI usage data is kept until your account is deleted. When you delete your account, product events and circle activity entries are unlinked from it: they remain, no longer linked to your account, for aggregate statistics.",
          "Invoices and the data needed to issue them are kept for the period required by accounting law, also after your account is deleted, no longer linked to it. Stripe also stores payment data under its own terms and the law; deleting your Berripop account doesn't delete it.",
          "Records of your acceptance of the Terms and of your AI consent are kept until your account is deleted.",
        ] },
        { heading: "Your rights", list: [
          "Access and portability: Settings → \"Download my data\" (JSON file).",
          "Rectification: you can edit your name and content in the app.",
          "Erasure: Settings → \"Delete account\". This permanently deletes your sign-in account and your content. If you have a renewing subscription, cancel it first. Your own circles go to the longest-standing other member; a circle with no other member is deleted.",
          "Restriction and objection: you can ask us to restrict processing and object to processing based on legitimate interest. Write to novakbernadett94@gmail.com.",
          "Withdrawing consent: where processing is based on consent, you can withdraw it any time. This doesn't affect earlier lawful processing.",
        ] },
        { heading: "Remedies", list: [
          "Hungarian National Authority for Data Protection and Freedom of Information (NAIH): Falk Miksa utca 9–11., 1055 Budapest, naih.hu",
          "You can also go to the regional court (törvényszék) competent for your place of residence or stay.",
        ] },
        { heading: "Children", body: ["Berripop is not for people under 16, and we don't knowingly collect personal data about anyone under 16. If we learn of such data, we delete it without undue delay."] },
        { heading: "Security", body: ["Connections are encrypted (HTTPS). The server checks access on every request. Your private content (journal, answers) is visible only to you until you share it."] },
        { heading: "Contact and changes to this policy", body: ["For questions or requests about your data, write to novakbernadett94@gmail.com.", "We announce changes on this page by updating the last updated date."] },
      ],
    },
    terms: {
      title: "Terms of service",
      intro: "These terms apply to using Berripop.",
      sections: [
        { heading: "The provider", list: ["Bujákné Novák Bernadett, sole proprietor (egyéni vállalkozó)", "Registration number: 58034914", "Tax number: 59982944-1-42", "Registered address: Sződliget utca 11., 1151 Budapest, Hungary", "Email: novakbernadett94@gmail.com"] },
        { heading: "The service", body: ["Berripop is an app for personal and shared growth: goals, daily questions, a journal, circles and AI-based feedback. It is not a medical, psychological or therapeutic service and doesn't diagnose. In a crisis, call the emergency number 112."] },
        { heading: "Account", body: ["Sign-up and sign-in use Clerk. You're responsible for keeping your account secure. Berripop is not for people under 16.", "You accept these terms before first using the app. If they change, you need to accept the new version to continue. We record when you accepted and which version."] },
        { heading: "Your content", body: ["Content you create is yours. Circle members only see your circle answers if you share them. Don't share anything that infringes others' rights."] },
        { heading: "Plans and subscription", list: [
          "Free plan: 1 active goal, 1 circle of your own, 5 AI assists and 3 journal reflections a week.",
          "Premium: HUF 2,990 per month or HUF 23,990 per year. Premium Plus: HUF 3,990 per month or HUF 31,990 per year. Both renew automatically until you cancel.",
          "Switching plans (between Premium and Premium Plus): in the billing portal, where you see the prorated difference before anything is charged.",
          "Paid plans also have weekly AI allowances; no plan is unlimited. The current allowances are shown on the Pricing page.",
          "Cancellation: any time in the billing portal (Settings → My subscription). Your plan stays active until the end of the paid period.",
          "Payments are handled by Stripe; we never see your card details.",
          "To pay, you give your name and billing address; the invoice is issued with these details. For now, you can subscribe with a billing address in Hungary.",
          "Paid features are available immediately after a successful payment.",
        ] },
        { heading: "AI features", body: ["AI responses are for information only and can be wrong. AI features have weekly allowances that depend on your plan."] },
        { heading: "Deleting your account", body: ["You can delete your account any time: Settings → \"Delete account\". If you have a renewing subscription, cancel it first. Deletion is permanent: your sign-in account and your content are deleted and can't be restored."] },
        { heading: "Complaints", body: ["Send complaints by email to novakbernadett94@gmail.com, or by post to the provider's address above. Tell us what the complaint is about and give the email address of your Berripop account, so we can identify it."] },
        { heading: "Governing law and contact", body: ["These terms are governed by Hungarian law. Send questions to novakbernadett94@gmail.com."] },
      ],
    },
    cookies: {
      title: "Cookie policy",
      intro: "Berripop only uses cookies and browser storage that the app needs to work. We use no analytics or advertising cookies.",
      sections: [
        { heading: "Cookies", list: [
          "Clerk session cookies: needed to keep you signed in.",
          "kozos-locale: your chosen language, so pages load in it straight away. Valid for one year.",
          "On the payment page, Stripe may set its own cookies on its own domain.",
        ] },
        { heading: "Data stored in your browser (localStorage)", list: [
          "kozos-locale: your chosen language.",
          "kozos-upgrade-dismissed:*: Premium offers you've hidden.",
          "berripop-first-steps-hidden: whether you've hidden the \"First steps\" card.",
          "kozos-prototype-v1: where My Inner World moments used to be kept. After you sign in they are moved to your account once, then removed from here.",
        ] },
        { heading: "Visitor statistics", body: ["Page views are counted with Vercel Web Analytics, in aggregate, without cookies or an identifier stored in your browser. It doesn't follow you to other sites or identify you."] },
        { heading: "External content", body: ["Fonts are loaded from Google Fonts, so your browser connects to Google's servers, and Google receives your IP address in the process."] },
        { heading: "Consent", body: ["Because we only use cookies needed for the app to work, we don't show a cookie consent banner."] },
      ],
    },
    contact: {
      title: "Contact",
      intro: "Have a question, need help, or want to contact us about your data?",
      sections: [
        { heading: "Contact details", list: ["Email (general and data protection): novakbernadett94@gmail.com", "Postal address: Bujákné Novák Bernadett, sole proprietor, Sződliget utca 11., 1151 Budapest, Hungary"] },
        { heading: "Things you can do yourself", list: [
          "Download your data: Settings → \"Download my data\".",
          "Delete your account: Settings → \"Delete account\".",
          "Cancel your subscription, invoices and payment method: Settings → My subscription → \"Manage billing\".",
        ] },
      ],
    },
  },
};

export const legal: Record<Locale, LegalSet> = { hu, en };
