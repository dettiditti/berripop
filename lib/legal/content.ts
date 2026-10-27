import type { Locale } from "../i18n/config";

/**
 * DRAFT legal texts (Hungarian and English), written from what the app
 * actually does (audited 2026-10-25): Clerk sign-in, Neon database (us-east-1),
 * Vercel hosting and AI Gateway, OpenAI gpt-5-mini via the Gateway, Stripe
 * payments, first-party product events, cookieless Vercel Web Analytics, no
 * analytics or advertising cookies.
 *
 * Operator details come from the owner (same sole proprietorship as her earlier
 * product). NOT legally reviewed. Every `[[...]]` is a decision a lawyer
 * must make or something to verify; the page highlights them.
 */

export type LegalSection = { heading: string; body?: string[]; list?: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };
export type LegalKind = "privacy" | "terms" | "cookies" | "contact";

type LegalSet = {
  draftBanner: string;
  back: string;
  updated: string;
  docs: Record<LegalKind, LegalDoc>;
  nav: Record<LegalKind, string>;
};

const hu: LegalSet = {
  draftBanner: "Tervezet: ez a dokumentum még nem esett át jogi ellenőrzésen. A kiemelt [[…]] részeket a végleges közzététel előtt jogásszal kell egyeztetni.",
  back: "Vissza a Berripophoz",
  updated: "Hatályos: [[a közzététel napja]]",
  nav: { privacy: "Adatkezelési tájékoztató", terms: "Felhasználási feltételek", cookies: "Cookie-tájékoztató", contact: "Kapcsolat" },
  docs: {
    privacy: {
      title: "Adatkezelési tájékoztató",
      intro: "Ez a tájékoztató leírja, milyen adatokat kezel a Berripop, mire használja őket, kik dolgozzák fel őket, és milyen jogaid vannak.",
      sections: [
        { heading: "Az adatkezelő", list: ["Adatkezelő: Bujákné Novák Bernadett egyéni vállalkozó", "Nyilvántartási szám: 58034914", "Adószám: 59982944-1-42", "Székhely: 1151 Budapest, Sződliget utca 11.", "E-mail: novakbernadett94@gmail.com", "Honlap: www.berripop.com"], body: ["Az adatkezelő a személyes adatokat a vonatkozó jogszabályok, különösen az Európai Parlament és a Tanács (EU) 2016/679 rendelete (GDPR) szerint kezeli."] },
        { heading: "Milyen adatokat kezelünk", list: [
          "Fiókadatok: e-mail-cím, és ha megadod, a neved. Google-bejelentkezésnél a Google által átadott név, e-mail-cím és profilkép. A bejelentkezést a Clerk kezeli.",
          "Profil és beállítások: megjelenített név, a választott nyelv.",
          "Az általad létrehozott tartalom: fejlődési célok és lépések, a kezdeti felmérés válaszai és a személyes terv, naplóbejegyzések, AI-reflexiók, mentett gondolatok, a saját utad és a köri válaszaid, a Belső világ pillanatai (választott szavak és jegyzet), reakciók és saját kérdések.",
          "Haladás: teljesített utazásnapok és napi kérdések dátuma, XP, jelvények. Tartalmat nem tárol, csak azt, hogy mit és mikor teljesítettél.",
          "Körök: tagság és szerep. A köri válaszaidat a kör tagjai csak akkor látják, ha megosztod őket.",
          "Előfizetés: csomag, állapot, számlázási időszak vége. A bankkártya-adatokat kizárólag a Stripe kezeli, mi nem látjuk őket.",
          "AI-használat: funkció, modell, tokenszám, becsült költség és időpont. A kérések és válaszok szövegét nem naplózzuk.",
          "Termékesemények: például regisztráció, első cél, előfizetés indítása. Csak az esemény neve és időpontja, tartalom nélkül.",
          "Technikai adatok: a tárhely- és bejelentkezési szolgáltatók a működéshez és a biztonsághoz naplózhatnak IP-címet, böngésző- és eszközadatokat.",
        ] },
        { heading: "Mire használjuk és milyen jogalapon", list: [
          "A fiók létrehozása és a szolgáltatás nyújtása (célok, napló, körök, felmérés). Jogalap: szerződés teljesítése (GDPR 6. cikk (1) b) pont).",
          "AI-funkciók, kizárólag a kifejezett kérésedre. Jogalap: szerződés teljesítése (GDPR 6. cikk (1) b) pont). [[jogi ellenőrzés: szükséges-e külön hozzájárulás]]",
          "Előfizetés és számlázás a Stripe-on keresztül. Jogalap: szerződés teljesítése és jogi kötelezettség (GDPR 6. cikk (1) b) és c) pont), például a számviteli bizonylatok megőrzése.",
          "A rendszer biztonsága, a hibák javítása és a termék fejlesztését segítő, tartalom nélküli mérés. Jogalap: jogos érdek (GDPR 6. cikk (1) f) pont). [[érdekmérlegelési teszt elkészítése]]",
        ] },
        { heading: "AI-feldolgozás", body: [
          "Ha AI-funkciót kérsz (napló-reflexió, továbbgondoló kérdés, összefoglaló, kezdeti felmérés), az ehhez szükséges szöveget az OpenAI-nak (gpt-5-mini modell) küldjük. A szolgáltató nem használja ezeket az adatokat modelltanításra. Kérés nélkül semmilyen tartalmad nem kerül AI-hoz.",
          "A Berripop az elmélyülést segíti, nem állít fel diagnózist, és nem helyettesíti a szakmai segítséget.",
        ] },
        { heading: "Adatfeldolgozók", list: [
          "Vercel Inc.: tárhely, az AI-kérések továbbítása és a süti nélküli látogatottság-mérés.",
          "Neon: adatbázis. Az adatok jelenleg az USA keleti régiójában (us-east-1) tárolódnak.",
          "Clerk: azonosítás és bejelentkezés.",
          "Stripe: fizetés és számlázás.",
          "OpenAI: AI-válaszok.",
          "Google: Google-bejelentkezés (ha ezt választod), valamint a betűtípusok betöltése a Google Fonts szolgáltatásból.",
          "A belépéshez szükséges e-maileket (például megerősítő kódokat) a Clerk küldi.",
          "Az adatfeldolgozók az adatokat a GDPR szerinti adatfeldolgozói feltételeik alapján, az adatkezelő utasításai szerint kezelik. [[az adatfeldolgozói szerződések (DPA) elfogadásának ellenőrzése szolgáltatónként]]",
        ] },
        { heading: "Adattovábbítás az EGT-n kívülre", body: ["Több szolgáltató (Vercel, Neon, Clerk, Stripe, OpenAI, Google) az Egyesült Államokban is kezel adatot. A továbbítás az EU által elfogadott megfelelő garanciák alapján történik: az EU–USA adatvédelmi keretrendszer vagy az általános szerződési feltételek (SCC). [[szolgáltatónként ellenőrizendő, melyik garancia vonatkozik rájuk]]"] },
        { heading: "Meddig őrizzük az adatokat", body: [
          "A fiókodat és a tartalmaidat addig őrizzük, amíg nem törlöd őket vagy a fiókodat. A naplóbejegyzések egyenként és egyben is törölhetők.",
          "Az AI-használati adatokat és a termékeseményeket jelenleg a fiók törléséig őrizzük; automatikus, időalapú törlés még nincs. [[megőrzési idő meghatározása ezekre az adatokra]]",
          "A számviteli bizonylatokhoz kapcsolódó adatokat a jogszabályok szerint legalább 8 évig megőrizzük. A fizetési és számlázási adatokat a Stripe a saját feltételei és a jogszabályok szerint őrzi.",
        ] },
        { heading: "A jogaid", list: [
          "Hozzáférés és adathordozhatóság: Beállítások → „Adataim letöltése” (JSON-fájl).",
          "Helyesbítés: a nevedet és a tartalmaidat az alkalmazásban szerkesztheted.",
          "Törlés: Beállítások → „Fiók törlése”. A saját köreidet a legrégebbi másik tag kapja meg; ha nincs más tag, a kör is törlődik.",
          "Az adatkezelés korlátozása és tiltakozás: kérheted az adatkezelés korlátozását, és tiltakozhatsz a jogos érdeken alapuló adatkezelés ellen. Írj a novakbernadett94@gmail.com címre.",
          "Hozzájárulás visszavonása: ha egy adatkezelés hozzájáruláson alapul, azt bármikor visszavonhatod. Ez a korábbi, jogszerű adatkezelést nem érinti.",
        ] },
        { heading: "Jogorvoslat", list: [
          "Nemzeti Adatvédelmi és Információszabadság Hatóság (NAIH): 1055 Budapest, Falk Miksa utca 9–11., naih.hu",
          "Bírósági eljárást is indíthatsz a lakóhelyed vagy tartózkodási helyed szerint illetékes törvényszék előtt.",
        ] },
        { heading: "Gyermekek", body: ["A Berripop 16 éven aluliak számára nem használható, és tudatosan nem gyűjtünk 16 év alattiakra vonatkozó személyes adatot. Ha ilyen adat a tudomásunkra jut, indokolatlan késedelem nélkül töröljük."] },
        { heading: "Biztonság", body: ["A kapcsolat titkosított (HTTPS). A hozzáférést a szerver minden kérésnél ellenőrzi. Privát tartalmaidat (napló, válaszok) csak te látod, amíg nem osztod meg őket."] },
        { heading: "Kapcsolat és a tájékoztató módosítása", body: ["Adatkezeléssel kapcsolatos kérdés vagy kérelem esetén írj a novakbernadett94@gmail.com címre.", "A tájékoztató módosításáról ezen az oldalon adunk tájékoztatást, a hatálybalépés dátumának frissítésével. [[jelentős változásnál e-mailes értesítés szükségessége – jogi döntés]]"] },
      ],
    },
    terms: {
      title: "Felhasználási feltételek",
      intro: "Ezek a feltételek a Berripop használatára vonatkoznak.",
      sections: [
        { heading: "A szolgáltató", list: ["Bujákné Novák Bernadett egyéni vállalkozó", "Nyilvántartási szám: 58034914", "Adószám: 59982944-1-42", "Székhely: 1151 Budapest, Sződliget utca 11.", "E-mail: novakbernadett94@gmail.com"] },
        { heading: "A szolgáltatás", body: ["A Berripop személyes és közös fejlődést segítő alkalmazás: célok, napi kérdések, napló, körök és AI-alapú visszajelzések. Nem orvosi, pszichológiai vagy terápiás szolgáltatás, és nem állít fel diagnózist. Krízishelyzetben hívd a 112-es segélyhívó számot."] },
        { heading: "Fiók", body: ["A regisztrációhoz és a bejelentkezéshez a Clerk szolgáltatást használjuk. A fiókod biztonságáért te felelsz. A Berripop 16 éven aluliak számára nem használható."] },
        { heading: "A tartalmaid", body: ["Az általad létrehozott tartalom a tiéd. A köri válaszaidat csak akkor látják a kör tagjai, ha megosztod őket. Ne ossz meg olyat, ami mások jogait sérti. [[tiltott tartalmak és felhasználás részletezése]]"] },
        { heading: "Csomagok és előfizetés", list: [
          "Ingyenes csomag: a funkciók egy része, heti AI-keretekkel.",
          "Premium: 2 990 Ft/hó vagy 23 990 Ft/év. Premium Plus: 3 990 Ft/hó vagy 31 990 Ft/év. Mindkettő automatikusan megújul, amíg le nem mondod.",
          "Csomagváltás (Premium és Premium Plus között): a számlázási portálon, ahol terhelés előtt látod az időarányos különbözetet.",
          "A fizetős csomagok heti AI-keretekkel működnek (méltányos használat és költségvédelem); egyik csomag sem korlátlan.",
          "Lemondás: bármikor a számlázási portálon (Beállítások → Előfizetésem). A csomagod a kifizetett időszak végéig aktív marad.",
          "A fizetést a Stripe kezeli. [[az árak áfatartalmának feltüntetése; az elállási jog digitális szolgáltatásnál – jogi ellenőrzés]]",
        ] },
        { heading: "AI-funkciók", body: ["Az AI-válaszok tájékoztató jellegűek, és tévedhetnek. Az AI-funkciókra heti keretek vonatkoznak. [[méltányos használat szabályai]]"] },
        { heading: "A szolgáltatás változása és megszüntetése", body: ["A fiókodat bármikor törölheted a Beállításokban. [[a szolgáltató által történő felfüggesztés vagy megszüntetés feltételei]]"] },
        { heading: "Felelősség", body: ["[[felelősségkorlátozás – jogi szöveg]]"] },
        { heading: "Irányadó jog és jogviták", body: ["A feltételekre a magyar jog az irányadó. [[fogyasztói jogviták: illetékes békéltető testület és bíróság megjelölése – jogi szöveg]]"] },
      ],
    },
    cookies: {
      title: "Cookie-tájékoztató",
      intro: "A Berripop csak a működéshez szükséges sütiket és böngészőben tárolt adatokat használja. Analitikai vagy hirdetési sütit nem használunk.",
      sections: [
        { heading: "Sütik", list: [
          "Clerk munkamenet-sütik: a bejelentkezés fenntartásához szükségesek.",
          "kozos-locale: a választott nyelv, egy évig.",
          "A fizetési oldalon a Stripe a saját domainjén saját sütiket használhat.",
        ] },
        { heading: "A böngésződben tárolt adatok (localStorage)", list: [
          "kozos-locale: a választott nyelv.",
          "kozos-upgrade-dismissed:*: az általad elrejtett Premium-ajánlatok.",
          "berripop-first-steps-hidden: elrejtetted-e az „Első lépések” kártyát.",
          "kozos-prototype-v1: régebben itt tároltuk a Belső világ pillanatait. Bejelentkezés után egyszer áthelyezzük őket a fiókodba, majd töröljük innen.",
        ] },
        { heading: "Látogatottság mérése", body: ["Az oldalmegtekintéseket a Vercel Web Analytics méri, süti és böngészőben tárolt azonosító nélkül, összesítve. Nem követ más oldalakon, és nem azonosít téged."] },
        { heading: "Külső tartalom", body: ["A betűtípusokat a Google Fonts szolgáltatásból töltjük be, ezért a böngésződ kapcsolódik a Google szervereihez. [[saját tárhelyre költöztetés megfontolása]]"] },
        { heading: "Hozzájárulás", body: ["Mivel csak a működéshez szükséges sütiket használjuk, nem jelenítünk meg süti-hozzájárulási ablakot. [[jogi ellenőrzés]]"] },
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
  draftBanner: "Draft: this document has not been legally reviewed. The highlighted [[…]] parts must be agreed with a lawyer before final publication.",
  back: "Back to Berripop",
  updated: "Effective: [[date of publication]]",
  nav: { privacy: "Privacy policy", terms: "Terms of service", cookies: "Cookie policy", contact: "Contact" },
  docs: {
    privacy: {
      title: "Privacy policy",
      intro: "This policy describes what data Berripop processes, what for, who processes it, and what your rights are.",
      sections: [
        { heading: "The controller", list: ["Controller: Bujákné Novák Bernadett, sole proprietor (egyéni vállalkozó)", "Registration number: 58034914", "Tax number: 59982944-1-42", "Registered address: Sződliget utca 11., 1151 Budapest, Hungary", "Email: novakbernadett94@gmail.com", "Website: www.berripop.com"], body: ["The controller processes personal data in line with applicable law, in particular Regulation (EU) 2016/679 (GDPR)."] },
        { heading: "What data we process", list: [
          "Account data: email address and, if you provide it, your name. With Google sign-in, the name, email address and profile picture Google shares. Sign-in is handled by Clerk.",
          "Profile and settings: display name, chosen language.",
          "Content you create: growth goals and steps, your initial assessment answers and personal plan, journal entries, AI reflections, saved thoughts, answers on your own path and in circles, My Inner World moments (chosen words and a note), reactions and your own questions.",
          "Progress: dates of completed journey days and daily questions, XP and badges. No content, only what you completed and when.",
          "Circles: membership and role. Circle members only see your circle answers if you share them.",
          "Subscription: plan, status, end of the billing period. Card details are handled only by Stripe; we never see them.",
          "AI usage: feature, model, token counts, estimated cost and time. We don't log the text of requests or responses.",
          "Product events: for example sign-up, first goal, starting a subscription. Only the event name and time, no content.",
          "Technical data: hosting and sign-in providers may log IP addresses, browser and device data for operation and security.",
        ] },
        { heading: "Purposes and legal bases", list: [
          "Creating your account and providing the service (goals, journal, circles, assessment). Legal basis: performance of a contract (GDPR Art. 6(1)(b)).",
          "AI features, only when you explicitly ask. Legal basis: performance of a contract (GDPR Art. 6(1)(b)). [[legal review: whether separate consent is needed]]",
          "Subscription and billing via Stripe. Legal basis: contract and legal obligation (GDPR Art. 6(1)(b) and (c)), e.g. keeping accounting records.",
          "System security, fixing errors and content-free measurement to improve the product. Legal basis: legitimate interest (GDPR Art. 6(1)(f)). [[prepare a legitimate interest assessment]]",
        ] },
        { heading: "AI processing", body: [
          "When you ask for an AI feature (journal reflection, follow-up question, summary, initial assessment), the text it needs is sent to OpenAI (gpt-5-mini model). The provider doesn't use this data for model training. None of your content goes to an AI unless you ask.",
          "Berripop supports reflection; it doesn't diagnose and doesn't replace professional help.",
        ] },
        { heading: "Processors", list: [
          "Vercel Inc.: hosting, forwarding AI requests and cookieless visitor statistics.",
          "Neon: database. Data is currently stored in the US East region (us-east-1).",
          "Clerk: authentication and sign-in.",
          "Stripe: payments and billing.",
          "OpenAI: AI responses.",
          "Google: Google sign-in (if you choose it), and loading fonts from Google Fonts.",
          "Emails needed for signing in (e.g. verification codes) are sent by Clerk.",
          "Processors handle the data under their GDPR data processing terms, on the controller's instructions. [[check acceptance of the data processing agreements (DPA) per provider]]",
        ] },
        { heading: "Transfers outside the EEA", body: ["Several providers (Vercel, Neon, Clerk, Stripe, OpenAI, Google) also process data in the United States. Transfers rely on safeguards approved by the EU: the EU–US Data Privacy Framework or standard contractual clauses (SCC). [[check which safeguard applies to each provider]]"] },
        { heading: "Retention", body: [
          "We keep your account and content until you delete them or your account. Journal entries can be deleted one by one or all at once.",
          "AI usage data and product events are currently kept until your account is deleted; there is no automatic, time-based deletion yet. [[define a retention period for this data]]",
          "Data related to accounting records is kept for at least 8 years as required by law. Stripe keeps payment and billing data according to its own terms and the law.",
        ] },
        { heading: "Your rights", list: [
          "Access and portability: Settings → \"Download my data\" (JSON file).",
          "Rectification: you can edit your name and content in the app.",
          "Erasure: Settings → \"Delete account\". Your own circles go to the longest-standing other member; a circle with no other member is deleted.",
          "Restriction and objection: you can ask us to restrict processing and object to processing based on legitimate interest. Write to novakbernadett94@gmail.com.",
          "Withdrawing consent: where processing is based on consent, you can withdraw it any time. This doesn't affect earlier lawful processing.",
        ] },
        { heading: "Remedies", list: [
          "Hungarian National Authority for Data Protection and Freedom of Information (NAIH): Falk Miksa utca 9–11., 1055 Budapest, naih.hu",
          "You can also go to the regional court (törvényszék) competent for your place of residence or stay.",
        ] },
        { heading: "Children", body: ["Berripop is not for people under 16, and we don't knowingly collect personal data about anyone under 16. If we learn of such data, we delete it without undue delay."] },
        { heading: "Security", body: ["Connections are encrypted (HTTPS). The server checks access on every request. Your private content (journal, answers) is visible only to you until you share it."] },
        { heading: "Contact and changes to this policy", body: ["For questions or requests about your data, write to novakbernadett94@gmail.com.", "We announce changes on this page by updating the effective date. [[legal decision: whether significant changes require an email notice]]"] },
      ],
    },
    terms: {
      title: "Terms of service",
      intro: "These terms apply to using Berripop.",
      sections: [
        { heading: "The provider", list: ["Bujákné Novák Bernadett, sole proprietor (egyéni vállalkozó)", "Registration number: 58034914", "Tax number: 59982944-1-42", "Registered address: Sződliget utca 11., 1151 Budapest, Hungary", "Email: novakbernadett94@gmail.com"] },
        { heading: "The service", body: ["Berripop is an app for personal and shared growth: goals, daily questions, a journal, circles and AI-based feedback. It is not a medical, psychological or therapeutic service and doesn't diagnose. In a crisis, call the emergency number 112."] },
        { heading: "Account", body: ["Sign-up and sign-in use Clerk. You're responsible for keeping your account secure. Berripop is not for people under 16."] },
        { heading: "Your content", body: ["Content you create is yours. Circle members only see your circle answers if you share them. Don't share anything that infringes others' rights. [[details of prohibited content and use]]"] },
        { heading: "Plans and subscription", list: [
          "Free plan: part of the features, with weekly AI allowances.",
          "Premium: HUF 2,990 per month or HUF 23,990 per year. Premium Plus: HUF 3,990 per month or HUF 31,990 per year. Both renew automatically until you cancel.",
          "Switching plans (between Premium and Premium Plus): in the billing portal, where you see the prorated difference before anything is charged.",
          "Paid plans have weekly AI allowances (fair use and cost protection); no plan is unlimited.",
          "Cancellation: any time in the billing portal (Settings → My subscription). Your plan stays active until the end of the paid period.",
          "Payments are handled by Stripe. [[VAT display; withdrawal right for digital services – legal review]]",
        ] },
        { heading: "AI features", body: ["AI responses are for information only and can be wrong. AI features have weekly allowances. [[fair use rules]]"] },
        { heading: "Changes and termination", body: ["You can delete your account any time in Settings. [[conditions for suspension or termination by the provider]]"] },
        { heading: "Liability", body: ["[[limitation of liability – legal text]]"] },
        { heading: "Governing law and disputes", body: ["These terms are governed by Hungarian law. [[consumer disputes: competent conciliation body and court – legal text]]"] },
      ],
    },
    cookies: {
      title: "Cookie policy",
      intro: "Berripop only uses cookies and browser storage that the app needs to work. We use no analytics or advertising cookies.",
      sections: [
        { heading: "Cookies", list: [
          "Clerk session cookies: needed to keep you signed in.",
          "kozos-locale: your chosen language, for one year.",
          "On the payment page, Stripe may set its own cookies on its own domain.",
        ] },
        { heading: "Data stored in your browser (localStorage)", list: [
          "kozos-locale: your chosen language.",
          "kozos-upgrade-dismissed:*: Premium offers you've hidden.",
          "berripop-first-steps-hidden: whether you've hidden the \"First steps\" card.",
          "kozos-prototype-v1: where My Inner World moments used to be kept. After you sign in they are moved to your account once, then removed from here.",
        ] },
        { heading: "Visitor statistics", body: ["Page views are counted with Vercel Web Analytics, in aggregate, without cookies or an identifier stored in your browser. It doesn't follow you to other sites or identify you."] },
        { heading: "External content", body: ["Fonts are loaded from Google Fonts, so your browser connects to Google's servers. [[consider self-hosting the fonts]]"] },
        { heading: "Consent", body: ["Because we only use cookies needed for the app to work, we don't show a cookie consent banner. [[legal review]]"] },
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
