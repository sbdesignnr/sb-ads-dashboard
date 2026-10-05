// Overenie, že kontaktná osoba naozaj patrí k firme (a kto je jej konateľ).
// Predtým sa meno bralo z troch nespoľahlivých miest — z AI odhadu podľa textu
// webu (prebíjal register), z CSV databázy tretej strany (pozície ako "COO EMEA")
// a z vyhľadávania v ORSR podľa názvu bez kontroly, že ide o tú istú firmu. V
// oslovení potom stálo meno človeka, ktorý vo firme nefiguroval.
//
// Teraz sa osoba použije LEN ak ju potvrdí register alebo vlastný web firmy;
// inak vraciame null a oslovenie ostane bez mena.

import { enrichCompany, type RegistryPerson } from "./orsr";
import { enrichCompanyAres } from "./ares";
import { foldName, looseSamePerson, parseName } from "./person-name";
import type { OwnerSource } from "./owner-source";

export interface RegistrySnapshot {
  ico: string | null;
  matchedName: string;
  matchType: "ico" | "name";
  nameMatches: boolean;
  city: string | null;
  address: string | null;
  active: boolean;
  statusNote: string | null;
  owners: RegistryPerson[];
}

export interface OwnerVerification {
  registry: RegistrySnapshot | null;
  owner: { name: string; position: string | null; source: OwnerSource } | null;
  /** Stručný dôvod výsledku (log / diagnostika). */
  reason: string;
}


// Všeobecné schránky (patria firme, nie konkrétnemu človeku).
const GENERIC_MAILBOX_RE =
  /^(info|kontakt|contact|office|hello|hi|ahoj|mail|email|sekretariat|sekretar|recepcia|reception|obchod|sales|podpora|support|admin|web|firma|company|objednavky|objednavka|rezervacie|studio|ordinacia|klinika|team|sluzby|servis|zakazky|dopyt|poptavka|kancelar|kancelaria|marketing|hr|jobs|ucto|fakturacia|booking|reservation|rezervace|sluzba|zakaznicke|zakaznik)/;

/** Schránka ako info@/kontakt@ — patrí firme, nie konkrétnej osobe. */
export function isGenericMailbox(email: string | null | undefined): boolean {
  if (!email) return true; // bez e-mailu nie je koho poplietť
  const local = foldName(email.split("@")[0] ?? "").replace(/[\s-]/g, "");
  return GENERIC_MAILBOX_RE.test(local);
}

const LEADERSHIP_RE =
  /(konate[ľl]|majite[ľl]|zakladate[ľl]|riadite[ľl]|jednate[ľl]|majitel|zakladatel|jednatel|ředitel|\bceo\b|founder|owner|vlastn[ií]k|spolumajite[ľl])/i;

// Koniec vety: bodka/!/? + medzera + veľké písmeno, ALE nie za titulom ("Ing. Novák")
// ani za skratkou; nový riadok je tiež hranica.
const SENTENCE_END =
  /(?<!\b(?:Ing|Mgr|JUDr|MUDr|MVDr|PhDr|RNDr|PaedDr|Bc|Bca|MgA|Dr|prof|doc|arch|art|akad|MBA|PhD|CSc|sv|č|p|s\.r\.o|spol))[.!?](?=\s+\p{Lu})|\n/u;

/** Text v tej istej vete ako meno (max. ~90 znakov pred a ~60 za ním). */
function sentenceWindow(text: string, start: number, end: number): string {
  let before = text.slice(Math.max(0, start - 90), start);
  let after = text.slice(end, Math.min(text.length, end + 60));
  const lastEnd = [...before.matchAll(new RegExp(SENTENCE_END, "gu"))].pop();
  if (lastEnd?.index !== undefined) before = before.slice(lastEnd.index + lastEnd[0].length);
  const firstEnd = after.search(SENTENCE_END);
  if (firstEnd >= 0) after = after.slice(0, firstEnd);
  return `${before} ${after}`;
}

/**
 * Nájde osobu v texte VLASTNÉHO webu firmy: celé meno (krstné + priezvisko, aj v
 * opačnom poradí) v TEJ ISTEJ VETE ako vedúca rola (konateľ, majiteľ, zakladateľ,
 * riaditeľ, CEO…). Vráti zápis z webu vo forme "Krstné Priezvisko" (správna
 * diakritika). Samotná zmienka mena (tím, referencia, autor článku) nestačí — a
 * ani rola z vedľajšej vety.
 */
export function findLeaderOnSite(
  name: string,
  siteText: string,
): { spelled: string } | null {
  const p = parseName(name);
  if (!p || !siteText) return null;
  const given = foldName(p.given[0] ?? "");
  const sur = foldName(p.surname);
  if (given.length < 2 || sur.length < 2) return null;

  const tokens = [...siteText.matchAll(/[\p{L}][\p{L}'’-]*/gu)];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = foldName(tokens[i][0]);
    const b = foldName(tokens[i + 1][0]);
    const direct = a === given && b === sur;
    const reversed = a === sur && b === given;
    if (!direct && !reversed) continue;
    const start = tokens[i].index ?? 0;
    const end = (tokens[i + 1].index ?? 0) + tokens[i + 1][0].length;
    if (!LEADERSHIP_RE.test(sentenceWindow(siteText, start, end))) continue;
    const spelled = direct
      ? `${tokens[i][0]} ${tokens[i + 1][0]}`
      : `${tokens[i + 1][0]} ${tokens[i][0]}`;
    return { spelled };
  }
  return null;
}

// Užšia množina rolí pre SLEPÉ dohľadanie (bez known kandidáta): vynecháva "majiteľ"/"vlastník"/
// "riaditeľ", lebo v realitnej a stavebnej reči bežne znamenajú "majiteľ/vlastník bytu, pozemku,
// nehnuteľnosti" — nič o firme. Tieto slová sa naďalej používajú v findLeaderOnSite (LEADERSHIP_RE
// vyššie), kde je riziko nízke, lebo tam sa len POTVRDZUJE už known meno kandidáta.
const DISCOVERY_ROLE_RE = /konate[ľl](?:ka)?|jednate[ľl](?:ka)?|spolumajite[ľl](?:ka)?|zakladate[ľl](?:ka)?|\bceo\b|founder/gi;

/**
 * Nájde meno PRIAMO OZNAČENÉ rolou z DISCOVERY_ROLE_RE na vlastnom webe firmy (napr. "Konateľ: Ján
 * Novák", "Peter Horák, konateľ spoločnosti") — bez toho, aby sme meno vopred poznali (na rozdiel od
 * findLeaderOnSite, ktorý len POTVRDZUJE známeho kandidáta). Vyžaduje rolu hneď pri mene (~40 znakov,
 * v tej istej vete), aby sa nezamenil zamestnanec, referencia alebo klient spomenutý inde na stránke.
 * Veľké/malé písmená mena sa porovnávajú PRESNE (nie case-insensitive), inak by "vlastníka" pred
 * menom firmy vyzeralo ako meno osoby.
 */
export function discoverLeaderOnSite(siteText: string | null | undefined): { spelled: string } | null {
  if (!siteText) return null;
  const NAME = String.raw`\p{Lu}\p{Ll}+(?:[-'’]\p{Lu}?\p{Ll}+)?`;
  const TITLE = String.raw`(?:(?:Mgr|Ing|JUDr|MUDr|MVDr|PhDr|RNDr|Bc)\.\s*)?`;
  const pair = new RegExp(`${TITLE}(${NAME})\\s+(${NAME})`, "u");
  const ok = (a: string, b: string) => foldName(a).length >= 2 && foldName(b).length >= 2;
  const role = new RegExp(DISCOVERY_ROLE_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = role.exec(siteText))) {
    const end = m.index + m[0].length;
    const after = siteText.slice(end, end + 45).split(/[.\n]/)[0] ?? "";
    const hitAfter = pair.exec(after);
    if (hitAfter && ok(hitAfter[1], hitAfter[2])) return { spelled: `${hitAfter[1]} ${hitAfter[2]}` };
    const before = (siteText.slice(Math.max(0, m.index - 45), m.index).split(/[.\n]/).pop() ?? "").slice(-35);
    const hits = [...before.matchAll(new RegExp(pair.source, "gu"))];
    const last = hits.at(-1);
    if (last && ok(last[1], last[2])) return { spelled: `${last[1]} ${last[2]}` };
  }
  return null;
}

/** websiteTier, ale bez potreby poznať meno vopred (pozri discoverLeaderOnSite). */
function discoveredTier(siteText: string | null | undefined): { name: string; position: string | null; source: OwnerSource } | null {
  const hit = discoverLeaderOnSite(siteText);
  return hit ? { name: hit.spelled, position: null, source: "website" } : null;
}

/** Zo zoznamu členov orgánu vyber toho, kto je najvhodnejší adresát. */
function preferredOwner(owners: RegistryPerson[]): RegistryPerson {
  const rank = (o: RegistryPerson) => {
    const pos = o.position ?? "";
    if (/predseda predstavenstva/.test(pos) && !/pod/.test(pos)) return 0;
    if (/konate|jednatel|podnikate/.test(pos)) return 1;
    return 2;
  };
  return [...owners].sort((x, y) => rank(x) - rank(y))[0];
}

async function lookupRegistry(input: {
  cz: boolean;
  companyName: string;
  city?: string | null;
  ico?: string | null;
  websiteUrl?: string | null;
  trustIco?: boolean;
  personName?: string | null;
}): Promise<RegistrySnapshot | null> {
  const args = {
    name: input.companyName,
    ico: input.ico ?? null,
    city: input.city ?? null,
    websiteUrl: input.websiteUrl ?? null,
    trustIco: input.trustIco,
    personName: input.personName ?? null,
  };
  const primary = input.cz ? enrichCompanyAres : enrichCompany;
  const secondary = input.cz ? enrichCompany : enrichCompanyAres;

  let reg = await primary(args).catch(() => null);
  // Rovnaké 8-ciferné IČO môže existovať v SK aj CZ registri (iné firmy) — v
  // druhom registri preto prijmeme LEN zhodu, kde sedí aj názov firmy.
  if (!reg && input.ico) {
    const alt = await secondary(args).catch(() => null);
    if (alt?.nameMatches) reg = alt;
  }
  if (!reg) return null;
  return {
    ico: reg.ico,
    matchedName: reg.matchedName,
    matchType: reg.matchType,
    nameMatches: reg.nameMatches,
    city: reg.city,
    address: reg.address,
    active: reg.active,
    statusNote: reg.statusNote,
    owners: reg.owners,
  };
}

export async function verifyOwner(input: {
  companyName: string;
  city?: string | null;
  ico?: string | null;
  websiteUrl?: string | null;
  cz: boolean;
  /** Kandidát na oslovenie (CSV kontakt, meno z webu…) — neoverený. */
  candidate?: { name?: string | null; position?: string | null } | null;
  /** Text VLASTNÉHO webu firmy (domov + kontakt/o nás/právne stránky). */
  siteText?: string | null;
  /** IČO je overené/zadané ručne — nepožaduj podobnosť názvu. */
  trustIco?: boolean;
  /**
   * E-mail, na ktorý sa bude písať. Ak je osobný (nie info@) a kontakt z importu
   * nie je v registri, konateľa z registra NEDOSADZUJEME — schránka patrí inému
   * človeku a oslovili by sme ho cudzím menom.
   */
  email?: string | null;
}): Promise<OwnerVerification> {
  const candidateName = input.candidate?.name?.trim() || null;
  const registry = await lookupRegistry({ ...input, personName: candidateName });

  // 1) REGISTER — osoba je v štatutárnom orgáne firmy.
  if (registry && registry.owners.length) {
    const matched = candidateName
      ? registry.owners.find((o) => looseSamePerson(o.name, candidateName))
      : undefined;
    // Názov v registri nesedí s názvom leadu (značka vs. právny názov / cudzie
    // IČO) → firmu potvrdzuje len to, že kandidát je v orgáne.
    if (registry.matchType === "ico" && !registry.nameMatches && !matched) {
      const web = websiteTier(candidateName, input.candidate?.position, input.siteText);
      return {
        registry,
        owner: web,
        reason: web
          ? "IČO patrí firme s iným názvom, osoba potvrdená na webe"
          : "IČO patrí firme s iným názvom a osoba sa v orgáne nenašla",
      };
    }
    if (matched) {
      return {
        registry,
        owner: { name: matched.name, position: matched.position, source: "registry" },
        reason: "osoba je v štatutárnom orgáne registra",
      };
    }
    // Kontakt z importu v orgáne nie je. Konateľa z registra dosadíme LEN ak je
    // schránka všeobecná; osobná schránka patrí niekomu inému.
    if (!isGenericMailbox(input.email)) {
      const web = websiteTier(candidateName, input.candidate?.position, input.siteText) ?? discoveredTier(input.siteText);
      return {
        registry,
        owner: web,
        reason: web
          ? "osoba potvrdená na webe firmy"
          : "e-mail je osobný a jeho majiteľ nie je v štatutárnom orgáne - meno konateľa sa nepoužije",
      };
    }
    const chosen = preferredOwner(registry.owners);
    return {
      registry,
      owner: { name: chosen.name, position: chosen.position, source: "registry" },
      reason: "meno konateľa z registra (schránka je všeobecná, kontakt z importu sa v orgáne nenašiel)",
    };
  }

  // 2) VLASTNÝ WEB firmy (registri chýba/nemá konateľa — SZČO, ne-registrované).
  const web = websiteTier(candidateName, input.candidate?.position, input.siteText);
  if (web)
    return {
      registry,
      owner: web,
      reason: registry
        ? "register nemá konateľa; osoba potvrdená na webe firmy"
        : "firma nie je v registri; osoba potvrdená na webe firmy",
    };

  // 3) DOHĽADANIE na webe bez známeho kandidáta (meno priamo pri role: "Konateľ: …").
  const found = discoveredTier(input.siteText);
  if (found)
    return {
      registry,
      owner: found,
      reason: registry
        ? "register nemá konateľa; meno nájdené na webe pri označení role (konateľ/majiteľ)"
        : "firma nie je v registri; meno nájdené na webe pri označení role (konateľ/majiteľ)",
    };

  return {
    registry,
    owner: null,
    reason: registry
      ? "register nemá konateľa a osoba nie je potvrdená na webe"
      : "firma sa v registri nenašla a osoba nie je potvrdená na webe",
  };
}

function websiteTier(
  candidateName: string | null,
  candidatePosition: string | null | undefined,
  siteText: string | null | undefined,
): { name: string; position: string | null; source: OwnerSource } | null {
  if (!candidateName || !siteText) return null;
  const hit = findLeaderOnSite(candidateName, siteText);
  if (!hit) return null;
  const p = parseName(candidateName);
  // titul(y) z kandidáta + správne písané meno z webu
  const titles = p?.titlesBefore.length ? `${p.titlesBefore.join(" ")} ` : "";
  return {
    name: `${titles}${hit.spelled}`.trim(),
    position: candidatePosition ?? null,
    source: "website",
  };
}
