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
    role: "Stratég ponúk a oslovenia",
    department: "predaj",
    tagline: "Zistí o firme všetko overiteľné a navrhne ponuku, ktorá sa neodmieta.",
    bio: "Nora pripraví ponuku šitú na mieru pre jeden konkrétny lead. V pracovni jej zadáš firmu a do 1 až 2 minút ti položí na stôl: overené zistenia o firme (každé s citátom zo zdroja), navrhnutú ponuku a hotový koncept mailu. Prečíta ich web, Google profil a recenzie a porovná ich s konkurenciou v meste. Nič neodíde bez tvojho schválenia. Popri tom stráži rad konceptov mailov, ktoré čakajú na tvoje schválenie.",
    skills: [
      "Analýza webov",
      "Google profil a recenzie",
      "Konkurencia v meste",
      "Overené citáty",
      "Ponuky na mieru",
      "Koncepty mailov",
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
      { text: "Konkurenti v meste", color: "#60a5fa" },
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
        () => "Porovnávam firmu s konkurenciou v meste. Čísla nikdy neodhadujem.",
        () => "Každé tvrdenie overujem citátom zo zdroja. Čo nevieme doložiť, netvrdíme.",
        () => "Skladám ponuku šitú na mieru. Šablóny nechávam bokom.",
        () => "V recenziách ľudia píšu zaujímavé veci. Práve v nich sa skrýva dobrý úvod mailu.",
        (c) =>
          n(c, "drafting")
            ? "Píšem koncepty mailov. Trikrát prečítam, nech neznejú ako robot."
            : "Ešte chvíľu a mám ďalšie zistenia.",
      ],
      waiting: [
        (c) =>
          n(c, "researchReady")
            ? `Mám hotových ${n(c, "researchReady")} ${sk(n(c, "researchReady"), "ponuku", "ponuky", "ponúk")} s dôkazmi. Pozri ich v pracovni.`
            : `Mám pripravených ${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "koncept", "koncepty", "konceptov")}. Bez tvojho súhlasu nič neodíde.`,
        (c) =>
          `Mám pripravených ${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "koncept", "koncepty", "konceptov")}. Bez tvojho súhlasu nič neodíde.`,
        () => "Čakám na teba. Pozri si koncepty a schváľ tie, ktoré sa ti páčia.",
        (c) =>
          `${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "mail čaká", "maily čakajú", "mailov čaká")} na palec hore alebo dole.`,
        () => "Pošlem, len čo dáš zelenú. Ja to nenechám náhode.",
        () => "Ak sa ti nejaký mail nepáči, povedz mi a prepíšem ho.",
      ],
      idle: [
        () => "Všetko hotové. Zadaj mi lead v pracovni a pripravím ti ponuku na mieru.",
        () => "Kým nemám čo robiť, sledujem, či nikto neodpovedal.",
        () => "Pokoj pred ďalšou várkou leadov. Dám si kávu.",
        (c) =>
          n(c, "qualified")
            ? `Vo fronte je ${n(c, "qualified")} vhodných leadov. Stačí povedať, ktoré mám vziať.`
            : "Zatiaľ nemám žiadny vhodný lead. Skenujeme ďalší segment?",
        () => "Premýšľam, aká ponuka by ťa mohla zaujať ako prvá.",
      ],
      error: [
        () => "Niečo sa pokazilo pri poslednom behu. Pozri sa na to so mnou.",
        () => "Toto mi nevyšlo. Radšej to nechám overiť, než by som hádala.",
      ],
      greet: [
        () => "Ahoj Samuel! Rada ťa vidím.",
        () => "Zdravím, šéf. Čo budeme dnes lámať?",
        () => "Ahoj! Máš chvíľu? Rada ti ukážem, čo mám rozrobené.",
      ],
      hover: [
        () => "Ahoj! Klikni na mňa, poviem ti viac.",
        () => "Hm? Áno, som tu.",
        () => "Práve premýšľam. Ale pre teba mám čas.",
      ],
    },
    answers: {
      status: (s, c) => {
        if (s === "working")
          return n(c, "researchRunning")
            ? "Práve pripravujem ponuku pre lead, ktorý si mi zadal: zbieram dôkazy, overujem citáty a skladám ponuku. Priebeh vidíš v pracovni."
            : n(c, "scanning")
              ? "Práve skenujem segment: hľadám firmy, pozerám ich weby a hodnotím, kto by z novej stránky ťažil najviac."
              : n(c, "drafting")
                ? "Píšem koncepty mailov z uložených zistení. Každý prejde kontrolou kvality, až potom ho uvidíš."
                : "Analyzujem weby a firmy. Ešte nie som hotová, ale idem podľa plánu.";
        if (s === "waiting")
          return n(c, "researchReady")
            ? `Mám hotových ${n(c, "researchReady")} ${sk(n(c, "researchReady"), "ponuku", "ponuky", "ponúk")} na tvoje posúdenie a ${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "koncept", "koncepty", "konceptov")} mailov čaká na schválenie.`
            : `Moju prácu mám hotovú. ${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "koncept", "koncepty", "konceptov")} čaká na teba a bez schválenia nič neodíde.`;
        if (s === "error")
          return "Posledný beh mi skončil chybou. Ešte som ho neopakovala, aby sme zbytočne neplytvali kreditom.";
        return `Práve nič nerobím. Za posledných 24 hodín odišlo ${n(c, "sent24h")} ${sk(n(c, "sent24h"), "mail", "maily", "mailov")} a odpovedí za týždeň je ${n(c, "repliesWeek")}.`;
      },
      needs: (s, c) => {
        if (s === "waiting" && n(c, "researchReady"))
          return {
            text: `Pozri si ${n(c, "researchReady")} ${sk(n(c, "researchReady"), "hotovú ponuku", "hotové ponuky", "hotových ponúk")} v pracovni. Ak sa ti mail páči, jedným klikom z neho urobíš koncept.`,
            action: "workbench",
            cta: "Otvoriť pracovňu",
          };
        if (s === "waiting")
          return {
            text: `Potrebujem od teba schválenie ${n(c, "draftsWaiting")} ${sk(n(c, "draftsWaiting"), "konceptu", "konceptov", "konceptov")}. Rýchlo ich prejdeš a ja ich môžem poslať.`,
            href: "/leads/kampane",
            cta: "Otvoriť frontu na schválenie",
          };
        if (s === "working")
          return { text: "Zatiaľ nič. Nechaj ma dorobiť, dám ti vedieť." };
        if (s === "error")
          return {
            text: "Pozri prosím, čo sa stalo, a potvrď, či to mám skúsiť znova.",
            href: "/leads",
            cta: "Otvoriť leady",
          };
        return {
          text: n(c, "qualified")
            ? `Vo fronte je ${n(c, "qualified")} vhodných leadov. Vyber v pracovni firmu a pripravím pre ňu ponuku na mieru.`
            : "Potrebujem nový segment leadov. Spusti sken a ja sa do toho pustím.",
          action: "workbench",
          cta: "Otvoriť pracovňu",
        };
      },
      method:
        "Postupujem vždy rovnako. Najprv zozbieram dôkazy: web firmy, Google profil s recenziami a konkurentov v meste. Potom z nich vyvodím zistenia a ku každému pripojím doslovný citát. Kód overí, že citát v zdroji naozaj je, a druhá kontrola posúdi, či z dôkazov vyplýva celé tvrdenie. Nepodložené zahodím. Až z overených zistení navrhnem ponuku a napíšem mail. Číslo, ktoré nemám z dát, v ňom nenájdeš. Stojí to okolo 0,15 € za firmu.",
    },
  },
  {
    id: "miro",
    name: "Miro",
    role: "Skaut príležitostí",
    department: "marketing",
    tagline: "Stále hľadá a vyberá firmy, ktoré sa naozaj oplatí osloviť.",
    bio: "Miro prechádza tvoju zásobu leadov a nové firmy z Google. Najprv všetko lacno vyfiltruje v kóde (web, e-mail, aktívna firma), potom každému leadu spočíta skóre príležitosti a vyberie len tie najlepšie v prioritných odboroch (realitné kancelárie, stavebné firmy, fyzioterapeuti). Vybrané postúpi Nore, ktorá im cez noc pripraví ponuku. Nič neposiela a nič nemení, len vyberá a vysvetľuje prečo.",
    skills: ["Skóre príležitosti", "Filter leadov", "Overenie firiem", "Výber top leadov", "Nočná fronta pre Noru"],
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
      { text: "Skórujem weby", color: "#22d3ee" },
      { text: "Vyraďujem nevhodné", color: "#f87171" },
      { text: "Top výber pre Noru", color: "#4ade80" },
    ],
    links: [
      { label: "Leady", href: "/leads" },
      { label: "Kampane", href: "/leads/kampane" },
    ],
    lines: {
      working: [
        () => "Prechádzam nové firmy. Čo nemá web, e-mail alebo je reťazec, letí von.",
        () => "Hodnotím weby. Každý dostane skóre príležitosti a dôvod, prečo.",
        () => "Ešte pár webov a mám čerstvý výber pre Noru.",
      ],
      waiting: [
        () => "Rozpočet na tento mesiac je takmer vyčerpaný. Radšej počkám, než aby som míňal navyše.",
        () => "Čakám na nový mesiac alebo na povolenie z rozpočtu.",
      ],
      idle: [
        (c) =>
          n(c, "backlog")
            ? `V zásobe je ${n(c, "backlog")} vhodných leadov v mojich odboroch. Nové hľadám, až keď ich ubudne.`
            : "Zásoba je prázdna. Čas hľadať nové firmy.",
        (c) =>
          n(c, "picks")
            ? `Nora má z môjho výberu ešte ${n(c, "picks")} leadov na spracovanie.`
            : "Výber pre Noru je momentálne hotový.",
        () => "Nehľadám naslepo. Kým nemáme čo osloviť, šetrím rozpočet.",
        () => "Cez noc posielam Nore tých najlepších. Ráno nájdeš ponuky v jej pracovni.",
      ],
      error: [() => "Posledné hľadanie sa pokazilo. Pozri, čo hlásia skeny."],
      greet: [
        () => "Ahoj Samuel! Práve triedim, kto stojí za oslovenie.",
        () => "Zdravím. Chceš vedieť, koho som vybral a prečo?",
      ],
      hover: [() => "Hm? Práve pozerám horizont.", () => "Klikni, ukážem ti svoj výber."],
    },
    answers: {
      status: (s, c) =>
        s === "working"
          ? "Práve hľadám a hodnotím firmy. Až budem hotový, výber postúpi Nore."
          : s === "waiting"
            ? "Rozpočet na mesiac je takmer vyčerpaný, tak čakám. Nič nemíňam navyše."
            : `V zásobe mám ${n(c, "backlog")} vhodných leadov v prioritných odboroch. Nora z nich ešte nespracovala ${n(c, "picks")}.`,
      needs: () => ({
        text: "Zatiaľ nič. Pracujem sám a cez noc posielam Nore najlepších. Výsledky uvidíš v jej pracovni.",
      }),
      method:
        "Najprv lacno v kóde: firma musí byť aktívna, mať web a e-mail, nesmie byť reťazec. Potom spočítam skóre príležitosti 0 až 100: zastaraný web, chýbajúce HTTPS alebo mobil, overený konateľ, osobná schránka a prioritný odbor. Vyberám z odborov, ktoré si určil: realitné kancelárie, stavebné firmy a fyzioterapeuti. Najlepších zaradím Nore. Celé je to bez AI, takže ma to nestojí nič.",
    },
  },
];

export const agentById = (id: string) => AGENTS.find((a) => a.id === id);
export const plotById = (id: string) => PLOTS.find((p) => p.id === id);
export const departmentById = (id: string) => DEPARTMENTS.find((d) => d.id === id);

export const STATUS_LABEL: Record<AgentStatus, string> = {
  working: "Pracuje",
  waiting: "Čaká na teba",
  idle: "Nečinná",
  error: "Chyba",
};

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
