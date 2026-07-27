import type { Client, Project } from "@prisma/client";

const SUPPLIER = {
  name: "Bc. Samuel Bibeň – SB Design",
  address: "Mostná 42, 949 01 Nitra",
  ico: "55 123 456",
  dic: "SK1234567890",
  email: "biben@sbdesign.sk",
  phone: "+421 911 183 131",
};

const TYPE_LABEL: Record<string, string> = {
  web: "webovej stránky",
  eshop: "e-shopu",
  marketing: "marketingových služieb",
  other: "diela",
};

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function money(d: { toNumber(): number } | null): string {
  if (!d) return "—";
  return `${d.toNumber().toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/**
 * Vygeneruje HTML návrh zmluvy o dielo z údajov projektu a klienta. Je to
 * predvyplnená šablóna — pred odoslaním sa dá upraviť. Klient ju podpíše cez
 * verejný link (/zmluva/[token]).
 */
export function generateContractHtml(project: Project, client: Client): string {
  const dielo = TYPE_LABEL[project.type] ?? "diela";
  const total = money(project.price);
  const deposit = money(project.depositAmount);
  const deadline = project.deadline
    ? new Intl.DateTimeFormat("sk-SK", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(project.deadline)
    : "podľa dohody";

  return `
<h1>Zmluva o dielo</h1>
<p>uzatvorená podľa § 631 a nasl. Občianskeho zákonníka</p>

<h2>Zmluvné strany</h2>
<p><strong>Zhotoviteľ:</strong><br>
${SUPPLIER.name}<br>
${SUPPLIER.address}<br>
IČO: ${SUPPLIER.ico} · DIČ: ${SUPPLIER.dic}<br>
${SUPPLIER.email} · ${SUPPLIER.phone}</p>

<p><strong>Objednávateľ:</strong><br>
${esc(client.company)}<br>
${esc(client.address) || "—"}<br>
IČO: ${esc(client.ico) || "—"} · DIČ: ${esc(client.dic) || "—"}<br>
Kontaktná osoba: ${esc(client.name)} · ${esc(client.email)}${client.phone ? ` · ${esc(client.phone)}` : ""}</p>

<h2>1. Predmet zmluvy</h2>
<p>Predmetom tejto zmluvy je vytvorenie ${dielo} „<strong>${esc(project.name)}</strong>" (ďalej len „dielo") zhotoviteľom pre objednávateľa podľa jeho požiadaviek a zadania (dotazníka), ktoré tvorí neoddeliteľnú súčasť tejto zmluvy.</p>

<h2>2. Cena a platobné podmienky</h2>
<p>Celková cena diela je <strong>${total}</strong>.</p>
<p>Objednávateľ uhradí zálohu vo výške <strong>${deposit}</strong> (30 %) pred začatím prác. Zvyšná časť ceny je splatná po dokončení a odovzdaní diela.</p>

<h2>3. Termín dodania</h2>
<p>Zhotoviteľ sa zaväzuje odovzdať dielo do <strong>${deadline}</strong>, za predpokladu súčinnosti objednávateľa (dodanie podkladov, textov, obrázkov a spätnej väzby v dohodnutých termínoch).</p>

<h2>4. Práva a povinnosti</h2>
<p>Zhotoviteľ vytvorí dielo s odbornou starostlivosťou. Objednávateľ poskytne potrebnú súčinnosť a podklady. Autorské práva k dielu prechádzajú na objednávateľa po úplnom zaplatení ceny diela.</p>

<h2>5. Záverečné ustanovenia</h2>
<p>Zmluva nadobúda platnosť dňom podpisu oboch zmluvných strán. Vzťahy neupravené touto zmluvou sa riadia príslušnými ustanoveniami Občianskeho zákonníka. Zmeny je možné vykonať len písomným dodatkom.</p>

<p>V Nitre, dňa ${new Intl.DateTimeFormat("sk-SK", { day: "numeric", month: "long", year: "numeric" }).format(new Date())}</p>
`.trim();
}
