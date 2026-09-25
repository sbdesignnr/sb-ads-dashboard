// Register agentov ("impérium"): kto tu býva, v ktorej štvrti, ako vyzerá a čo hovorí.
// Súbor je zámerne čistý (žiadny server-only import) — používa ho aj klientská scéna
// (components/agents), aj serverový výpočet stavu (lib/agents/status.ts).
//
// AKO PRIDAŤ ĎALŠIEHO AGENTA
//  1. Pridaj záznam do AGENTS (unikátne id, meno, rola, štvrť, vzhľad, parcela `slot`).
//     Parcelu vyber z PLOTS (voľné parcely majú `id`) — agent sa nasťahuje na ňu a
//     prázdna parcela zmizne.
//  2. V lib/agents/status.ts pridaj funkciu, ktorá vráti jeho reálny stav
//     (pracuje / čaká na schválenie / nečinný) a zaregistruj ju v STATUS_PROVIDERS.
//  3. Hotovo — dom, postavička, bublinové hlášky a panel sa vykreslia samé.

export type AgentStatus = "working" | "waiting" | "idle" | "error";

/** Živé počítadlá agenta — vstup pre hlášky ("Mám {draftsWaiting} konceptov"). */
export type Counters = Record<string, number>;

export interface DepartmentDef {
  id: string;
  name: string;
  tagline: string;
  /** akcentová farba štvrte (hex) */
  color: string;
  /** obdĺžnik štvrte v mriežke ostrova [gx0, gy0, gx1, gy1] */
  rect: [number, number, number, number];
  /** kde stojí smerovník štvrte (mriežkové súradnice) */
  sign: [number, number];
}

export const DEPARTMENTS: DepartmentDef[] = [
  {
    id: "predaj",
    name: "Predaj a oslovenie",
    tagline: "Leady, ponuky, maily",
    color: "#f59e0b",
    rect: [7.5, 7.5, 14, 14],
    sign: [7.75, 11.2],
  },
  {
    id: "marketing",
    name: "Prieskum a marketing",
    tagline: "Hľadanie príležitostí, reklamy",
    color: "#ec4899",
    rect: [7.5, 0, 14, 6.5],
    sign: [7.75, 1.4],
  },
  {
    id: "technika",
    name: "Technika a web",
    tagline: "Weby, SEO, automatizácie",
    color: "#22d3ee",
    rect: [0, 7.5, 6.5, 14],
    sign: [5.3, 8.4],
  },
  {
    id: "financie",
    name: "Financie a admin",
    tagline: "Faktúry, zmluvy, prehľady",
    color: "#34d399",
    rect: [0, 0, 6.5, 6.5],
    sign: [5.6, 5.9],
  },
];

export interface Look {
  skin: string;
  hair: string;
  hairStyle: "bun" | "short" | "long" | "cap";
  outfit: string;
  outfitDark: string;
  pants: string;
  accent: string;
  glasses?: boolean;
  headset?: boolean;
}

export interface AgentLinkDef {
  label: string;
  href: string;
}

export interface AgentDef {
  id: string;
  name: string;
  /** rod agenta: riadi tvary slov ("nečinná" / "nečinný") */
  gender: "f" | "m";
  role: string;
  department: string;
  /** krátky slogan pod menom */
  tagline: string;
  bio: string;
  skills: string[];
  look: Look;
  /** parcela z PLOTS, na ktorej agent býva */
  plot: string;
  /** agent má pracovňu (zadávanie úloh a výsledky) */
  workbench?: boolean;
  /** vzhľad domčeka (strecha, múry); predvolene terakotová strecha */
  house?: { roof: string; wall: string };
  /** ako sa k domu chodí: "avenue" = po zvislej ceste k Nore, "corridor" = po vodorovnej ceste na námestie */
  access?: "avenue" | "corridor";
  /** čipy, ktoré sa vznášajú nad stolom, keď agent pracuje */
  chips?: { text: string; color: string }[];
  links: AgentLinkDef[];
  /** hlášky podľa stavu; funkcie dostanú živé počítadlá */
  lines: {
    working: ((c: Counters) => string)[];
    waiting: ((c: Counters) => string)[];
    idle: ((c: Counters) => string)[];
    error: ((c: Counters) => string)[];
    /** pozdrav po kliknutí */
    greet: ((c: Counters) => string)[];
    /** keď sa na ňu ukáže myšou */
    hover: ((c: Counters) => string)[];
  };
  /** odpovede na otázky v paneli */
  answers: {
    status: (s: AgentStatus, c: Counters) => string;
    needs: (s: AgentStatus, c: Counters) => { text: string; href?: string; cta?: string; action?: "workbench" };
    /** konkrétny postup pre človeka: čo má dnes urobiť (číslované kroky) */
    today: (s: AgentStatus, c: Counters) => { text: string; href?: string; cta?: string; action?: "workbench" };
    method: string;
  };
}

export interface PlotDef {
  id: string;
  department: string;
  /** ľavý horný roh parcely v mriežke */
  gx: number;
  gy: number;
  /** rozmer parcely (dlaždice) */
  w: number;
  d: number;
  /** námet na budúceho agenta — zobrazí sa pri prázdnej parcele */
  idea: { title: string; text: string };
}

export const PLOTS: PlotDef[] = [
  {
    id: "predaj-a",
    department: "predaj",
    gx: 9.0,
    gy: 8.7,
    w: 4.0,
    d: 4.4,
    idea: { title: "Domov pre Noru", text: "Tu býva Nora, stratég ponúk." },
  },
  {
    id: "marketing-a",
    department: "marketing",
    gx: 9.0,
    gy: 0.7,
    w: 4.0,
    d: 4.4,
    idea: { title: "Domov pre Mira", text: "Tu býva Miro, skaut príležitostí." },
  },
  {
    id: "technika-a",
    department: "technika",
    gx: 1.0,
    gy: 9.0,
    w: 2.8,
    d: 3.4,
    idea: {
      title: "SEO špecialista",
      text: "Pravidelne audituje weby klientov, sleduje pozície a hlási, čo treba opraviť.",
    },
  },
  {
    id: "technika-b",
    department: "technika",
    gx: 4.4,
    gy: 11.6,
    w: 1.8,
    d: 2.0,
    idea: {
      title: "Náhľady webov",
      text: "Automaticky vyrobí náhľad novej úvodnej stránky pre lead, aby si ho mohol priložiť k mailu.",
    },
  },
  {
    id: "financie-a",
    department: "financie",
    gx: 2.0,
    gy: 1.6,
    w: 3.0,
    d: 3.2,
    idea: {
      title: "Účtovník",
      text: "Pripomína faktúry po splatnosti, kontroluje príjmy a výdavky a chystá mesačný prehľad.",
    },
  },
];

// ─── Nora: stratég ponúk a oslovenia ────────────────────────────────────────

const n = (c: Counters, k: string) => c[k] ?? 0;
const sk = (v: number, one: string, few: string, many: string) =>
  v === 1 ? one : v >= 2 && v <= 4 ? few : many;

export const AGENTS: AgentDef[] = [
  {
    id: "nora",
    name: "Nora",
    gender: "f",
    role: "Stratég ponúk a oslovenia",
    department: "predaj",
    tagline: "Zistí o firme všetko overiteľné a napíše mail, ktorý sa neodmieta.",
    bio: "Nora pripraví ponuku a mail šitý na mieru pre jeden konkrétny lead. Prečíta jeho web, Google profil a recenzie, porovná ho s konkurenciou v meste a z overených zistení (každé s citátom zo zdroja) napíše tri varianty mailu. Simulovaný majiteľ firmy vyberie ten, ktorý by ho najskôr presvedčil. Pri najlepších leadoch sa najprv poradí s Mirom. Cez noc spracuje najviac 5 firiem a ráno nájdeš výsledky v jej pracovni. Nič neodíde bez tvojho schválenia. Návrhy stránok nerobí: tie ukážeš sám na konzultácii.",
    skills: [
      "Analýza webov",
      "Google profil a recenzie",
      "Konkurencia v meste",
      "Overené citáty",
      "Psychológia predaja",
      "Tri varianty mailu",
      "Ponuky na mieru",
    ],
    look: {
      skin: "#f1c4a0",
      hair: "#2a1c1a",
      hairStyle: "bun",
      outfit: "#3b5bdb",
      outfitDark: "#2f49b3",
      pants: "#1f2937",
      accent: "#f59e0b",
      glasses: true,
      headset: false,
    },
    plot: "predaj-a",
    workbench: true,
    chips: [
      { text: "Google recenzie", color: "#fbbf24" },
      { text: "Citát overený ✓", color: "#4ade80" },
      { text: "Tri varianty mailu", color: "#60a5fa" },
    ],
    links: [
      { label: "Fronta na schválenie", href: "/leads/kampane" },
      { label: "Leady", href: "/leads" },
    ],
    lines: {
      working: [
        (c) =>
          n(c, "researchRunning")
            ? "Zbieram dôkazy o firme a porovnávam ju s konkurenciou v meste. Ešte chvíľu."
            : n(c, "scanning")
              ? "Skenujem nový segment. Každý web si pozriem aj očami zákazníka."
              : "Prechádzam weby a Google profily. Zatiaľ nič, čo by som nevedela doložiť.",
        () => "Každé tvrdenie overujem citátom zo zdroja. Čo nevieme doložiť, netvrdíme.",
        () => "Píšem tri varianty mailu z rôznych uhlov. Potom ich prečíta simulovaný majiteľ a vyberie ten, ktorý by ho presvedčil.",
        () => "V recenziách ľudia píšu zaujímavé veci. Práve v nich sa skrýva dobrý úvod mailu.",
        () => "Radím sa s Mirom, ako tohto majiteľa osloviť.",
      ],
      waiting: [
        (c) =>
          n(c, "researchReady")
            ? `Mám hotových ${n(c, "researchReady")} ${sk(n(c, "researchReady"), "ponuku", "ponuky", "ponúk")}. Otvor pracovňu, prečítaj mail a jedným klikom z neho urobíš koncept.`
            : `${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "koncept čaká", "koncepty čakajú", "konceptov čaká")} na tvoje schválenie. Bez neho nič neodíde.`,
        (c) =>
          `${n(c, "researchReady") + n(c, "draftsWaiting")} vecí čaká na teba. Začni ponukami v pracovni.`,
        () => "Pošlem, len čo dáš zelenú. Ja to nenechám náhode.",
        () => "Ak sa ti mail nepáči, zahoď ho. Zajtra napíšem lepší.",
      ],
      idle: [
        () => "Všetko je vybavené. Cez noc pripravím ďalšie ponuky.",
        (c) =>
          n(c, "supply")
            ? `Miro mi nachystal ${n(c, "supply")} ${sk(n(c, "supply"), "lead", "leady", "leadov")}. Cez noc ich spracujem, najviac 5 za noc.`
            : "Miro zatiaľ nemá čo poslať. Dopĺňa zásobu.",
        () => "Kým nemám čo robiť, sledujem, či nikto neodpovedal.",
        () => "Premýšľam, aký uhol by mohol zabrať pri ďalšej firme.",
      ],
      error: [
        () => "Pri poslednom behu sa niečo pokazilo. Pozri sa na to so mnou.",
        () => "Toto mi nevyšlo. Radšej to nechám overiť, než by som hádala.",
      ],
      greet: [
        (c) =>
          n(c, "researchReady")
            ? `Ahoj Samuel! Mám pre teba ${n(c, "researchReady")} ${sk(n(c, "researchReady"), "hotovú ponuku", "hotové ponuky", "hotových ponúk")}. Začni v pracovni.`
            : n(c, "draftsWaiting")
              ? `Ahoj Samuel! ${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "koncept čaká", "koncepty čakajú", "konceptov čaká")} na tvoje schválenie.`
              : "Ahoj Samuel! Dnes je pokoj, všetko je vybavené.",
        () => "Zdravím, šéf. Nižšie vidíš, čo mám hotové a čo od teba potrebujem.",
      ],
      hover: [
        () => "Ahoj! Klikni na mňa a ukážem ti, čo mám hotové.",
        () => "Práve premýšľam nad ďalším mailom.",
        () => "Som tu. Kliknutím otvoríš môj profil.",
      ],
    },
    answers: {
      status: (s, c) => {
        if (s === "working")
          return n(c, "researchRunning")
            ? "Práve pripravujem ponuku pre firmu, ktorú som dostala od Mira alebo od teba: zbieram dôkazy, overujem citáty a píšem tri varianty mailu. Priebeh vidíš v pracovni."
            : n(c, "scanning")
              ? "Práve skenujem segment: hľadám firmy a pozerám ich weby."
              : "Analyzujem weby a firmy. Ešte nie som hotová, ale idem podľa plánu.";
        if (s === "waiting")
          return n(c, "researchReady")
            ? `Mám hotových ${n(c, "researchReady")} ${sk(n(c, "researchReady"), "ponuku", "ponuky", "ponúk")} na tvoje posúdenie a ${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "koncept", "koncepty", "konceptov")} mailov čaká na schválenie.`
            : `Moju prácu mám hotovú. ${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "koncept čaká", "koncepty čakajú", "konceptov čaká")} na teba a bez schválenia nič neodíde.`;
        if (s === "error")
          return "Posledný beh mi skončil chybou. Neopakovala som ho automaticky, aby sme zbytočne neplytvali kreditom.";
        return `Práve nič nerobím. Za posledných 7 dní odišlo ${n(c, "sentWeek")} ${sk(n(c, "sentWeek"), "mail", "maily", "mailov")} a odpovedí je ${n(c, "repliesWeek")}. Cez noc spracujem ďalšie firmy od Mira.`;
      },
      needs: (s, c) => {
        if (s === "waiting" && n(c, "researchReady"))
          return {
            text: `Prečítaj si ${n(c, "researchReady")} ${sk(n(c, "researchReady"), "hotovú ponuku", "hotové ponuky", "hotových ponúk")} v pracovni. Ak sedia fakty a mail znie ako ty, jedným klikom z neho urobíš koncept.`,
            action: "workbench",
            cta: "Otvoriť pracovňu",
          };
        if (s === "waiting")
          return {
            text: `Potrebujem tvoje schválenie ${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "konceptu", "konceptov", "konceptov")}. Po schválení odídu pri najbližšom odosielaní (po 8:30).`,
            href: "/leads/kampane",
            cta: "Otvoriť frontu na schválenie",
          };
        if (s === "working") return { text: "Zatiaľ nič. Nechaj ma dorobiť, výsledok nájdeš v pracovni." };
        if (s === "error")
          return {
            text: "Pozri v pracovni, čo sa stalo, a rozhodni, či to mám skúsiť znova.",
            action: "workbench",
            cta: "Otvoriť pracovňu",
          };
        return { text: "Momentálne nič. Cez noc pripravím ďalšie ponuky a ráno ti to napíšem na Telegram." };
      },
      today: (s, c) => {
        const r = n(c, "researchReady");
        const d = n(c, "draftsWaiting");
        if (!r && !d) return { text: "Dnes u mňa nemáš čo robiť. Cez noc pripravím ďalšie ponuky, ráno dostaneš prehľad na Telegram." };
        const steps: string[] = [];
        if (r)
          steps.push(
            `${steps.length + 1}. Otvor pracovňu a prečítaj ${r} ${sk(r, "ponuku", "ponuky", "ponúk")} (asi 2 minúty každú). Skontroluj, či sedia fakty a či mail znie ako ty. Potom klikni „Použiť ako koncept“, alebo ponuku zahoď.`,
          );
        if (d)
          steps.push(`${steps.length + 1}. Vo fronte na schválenie schváľ koncepty (${d}). Odídu pri najbližšom odosielaní, po 8:30.`);
        steps.push(`${steps.length + 1}. Ak niekto odpovie, dám ti vedieť v prehľade.`);
        return r
          ? { text: steps.join("\n"), action: "workbench", cta: "Otvoriť pracovňu" }
          : { text: steps.join("\n"), href: "/leads/kampane", cta: "Otvoriť frontu na schválenie" };
      },
      method:
        "Postupujem vždy rovnako. Najprv zozbieram dôkazy: web firmy, Google profil s recenziami a konkurentov v meste. Z nich vyvodím zistenia a ku každému pripojím doslovný citát. Kód overí, že citát v zdroji naozaj je, a druhá kontrola posúdi, či z dôkazov vyplýva celé tvrdenie. Nepodložené zahodím. Potom navrhnem ponuku, napíšem tri varianty mailu z rôznych uhlov a každý skontrolujem na pravdivosť. Simulovaný majiteľ firmy vyberie najlepší. Číslo, ktoré nemám z dát, v maile nenájdeš. Stojí to okolo 0,25 € za firmu.",
    },
  },
  {
    id: "miro",
    name: "Miro",
    gender: "m",
    role: "Skaut príležitostí",
    department: "marketing",
    tagline: "Hľadá a posudzuje firmy sám, každé rozhodnutie zdôvodní.",
    bio: "Miro pracuje sám, bez tvojho zásahu. Večer prechádza prioritné odbory (realitné kancelárie, stavebné firmy, fyzioterapeuti) segment po segmente a kraj po kraji cez Google, analyzuje weby a hľadá chýbajúce e-maily. Ku každej firme napíše odôvodnené posúdenie: aká konkrétna príležitosť pre SB Design (web, e-shop, reklamy) je v dátach doložená. Firmy bez príležitosti (dobrý web, koncern, iný odbor) skryje s dôvodom, aby si ich v zozname nemal. Vhodné postúpi Nore. Učí sa z toho, čo Nora vyradí a čo zahodíš ty.",
    skills: ["Sken segmentov a krajov", "Odôvodnené posúdenie", "Hľadanie e-mailov", "Skrývanie nevhodných s dôvodom", "Učenie zo spätnej väzby"],
    look: {
      skin: "#e6b08a",
      hair: "#3a281d",
      hairStyle: "cap",
      outfit: "#0f766e",
      outfitDark: "#0b5b55",
      pants: "#334155",
      accent: "#22d3ee",
      glasses: false,
      headset: true,
    },
    plot: "marketing-a",
    house: { roof: "#2f80c8", wall: "#e9f1f8" },
    access: "corridor",
    chips: [
      { text: "Skenujem kraje", color: "#22d3ee" },
      { text: "Hľadám e-maily", color: "#a78bfa" },
      { text: "Posudzujem s dôvodom", color: "#4ade80" },
    ],
    links: [
      { label: "Leady", href: "/leads" },
      { label: "Kampane", href: "/leads/kampane" },
    ],
    lines: {
      working: [
        () => "Skenujem ďalší kraj. Každý web najprv preverím kódom, až potom sa naň pozerá AI.",
        () => "Hodnotím weby. Každý dostane odôvodnené posúdenie: prečo áno alebo prečo nie.",
        () => "Hľadám chýbajúce e-maily vhodným firmám.",
      ],
      waiting: [
        () => "Rozpočet na tento mesiac je takmer vyčerpaný. Radšej počkám, než aby som míňal navyše.",
        () => "Čakám na nový mesiac alebo na povolenie z rozpočtu.",
      ],
      idle: [
        (c) =>
          n(c, "supply")
            ? `V zásobe je ${n(c, "supply")} ${sk(n(c, "supply"), "lead", "leady", "leadov")} pre Noru, vystačí približne ${n(c, "daysLeft")} ${sk(n(c, "daysLeft"), "deň", "dni", "dní")}.`
            : "Zásoba je prázdna. Večer idem hľadať nové firmy.",
        () => "Večer skenujem ďalší segment, cez noc posielam Nore tých najlepších.",
        () => "Nehľadám naslepo. Kým je zásoba plná, šetrím rozpočet.",
        (c) => (n(c, "rejectedWeek") ? `Tento týždeň som skryl ${n(c, "rejectedWeek")} nevhodných firiem, ku každej s dôvodom.` : "Zatiaľ som nikoho neskryl."),
      ],
      error: [() => "Posledné hľadanie sa pokazilo. Pozri, čo hlásia skeny."],
      greet: [
        (c) => `Ahoj Samuel! Pracujem sám. V zásobe je ${n(c, "supply")} ${sk(n(c, "supply"), "lead", "leady", "leadov")} pre Noru. Dole si môžeš pozrieť, koho som vybral a prečo.`,
        () => "Zdravím. Skenujem večer, ráno nájdeš výsledok v pracovni Nory. Nemusíš robiť nič.",
      ],
      hover: [
        () => "Práve pozerám horizont.",
        () => "Kliknutím otvoríš môj profil a výber.",
      ],
    },
    answers: {
      status: (s, c) =>
        s === "working"
          ? "Práve skenujem a posudzujem firmy. Až budem hotový, výber postúpi Nore."
          : s === "waiting"
            ? "Rozpočet na mesiac je takmer vyčerpaný, tak čakám. Nič nemíňam navyše."
            : `V zásobe mám ${n(c, "supply")} ${sk(n(c, "supply"), "lead", "leady", "leadov")} pre Noru. Pri 5 firmách za noc to vystačí približne ${n(c, "daysLeft")} ${sk(n(c, "daysLeft"), "deň", "dni", "dní")}. Dnes som urobil ${n(c, "scansToday")} ${sk(n(c, "scansToday"), "sken", "skeny", "skenov")}.`,
      needs: () => ({
        text: "Nič. Hľadám, posudzujem aj dopĺňam zásobu sám. Ty len ráno prezrieš ponuky od Nory.",
      }),
      today: (s, c) => ({
        text: `Tu nemusíš robiť nič. Skenujem sám (dnes ${n(c, "scansToday")} ${sk(n(c, "scansToday"), "sken", "skeny", "skenov")}), zásoba je ${n(c, "supply")} leadov. Ku každému leadu vidíš moje zdôvodnenie v pracovni Nory a skryté firmy nájdeš v Leadoch v záložke Skryté aj s dôvodom.`,
        href: s === "working" ? undefined : "/leads",
        cta: s === "working" ? undefined : "Otvoriť leady",
      }),
      method:
        "Idem systematicky: segment po segmente (najprv realitné, potom stavebné, potom fyzio) a kraj po kraji. Google mi dá firmy s webom, kód preverí web (rýchlosť, mobil, HTTPS, technológia, rok v pätičke), AI ho vyhodnotí zo screenshotu. Potom každý lead posúdim: patrí do odboru, je malá firma, a hlavne, je v dátach DOLOŽENÁ konkrétna príležitosť? Bez dôkazu firmu neposúvam. Chýbajúci e-mail hľadám na ich webe. Vhodné idú Nore, nevhodné skryjem s dôvodom. Poučenia z toho, čo Nora vyradí a čo ty zahodíš, si pamätám a používam ich pri ďalšom posudzovaní.",
    },
  },
];

export const agentById = (id: string) => AGENTS.find((a) => a.id === id);
export const plotById = (id: string) => PLOTS.find((p) => p.id === id);
export const departmentById = (id: string) => DEPARTMENTS.find((d) => d.id === id);

export const STATUS_LABEL: Record<AgentStatus, string> = {
  working: "Pracuje",
  waiting: "Čaká na teba",
  idle: "Má voľno",
  error: "Chyba",
};

/** Stav slovom so správnym rodom ("Nečinná" pri Nore, "Nečinný" pri Mirovi). */
export function statusLabel(agent: Pick<AgentDef, "gender">, s: AgentStatus): string {
  return s === "idle" ? (agent.gender === "m" ? "Nečinný" : "Nečinná") : STATUS_LABEL[s];
}

export const STATUS_COLOR: Record<AgentStatus, string> = {
  working: "#22c55e",
  waiting: "#f59e0b",
  idle: "#94a3b8",
  error: "#ef4444",
};

export interface AgentStat {
  label: string;
  value: string;
  hint?: string;
}

export interface AgentEvent {
  /** ISO čas */
  at: string;
  text: string;
  tone: "ok" | "info" | "warn";
}

/** Čo API vráti o jednom agentovi. */
export interface AgentSnapshot {
  status: AgentStatus;
  /** jedna veta o tom, čo práve robí / na čo čaká */
  headline: string;
  /** aktuálny krok práce (napr. "Overujem citáty…"), ak agent práve pracuje */
  detail?: string;
  counters: Counters;
  stats: AgentStat[];
  activity: AgentEvent[];
  /** ISO čas výpočtu */
  updatedAt: string;
}

export type AgentSnapshots = Record<string, AgentSnapshot>;
