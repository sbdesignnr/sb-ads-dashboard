import sanitizeHtml from "sanitize-html";

/**
 * Poznámky sa ukladajú ako HTML z editora. Aj keď je jediný autor prihlásený
 * používateľ, uložené HTML sa raz vykreslí — takže do stĺpca púšťame len značky,
 * ktoré editor naozaj vie vytvoriť. Všetko ostatné (skripty, iframe, on* atribúty,
 * `javascript:` odkazy) sa zahodí.
 */

// Presne to, čo vie vyrobiť panel nástrojov v components/learning/NoteEditor.tsx.
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "mark",
  "code",
  "pre",
  "blockquote",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "hr",
  "div",
  "label",
  "input", // checkbox v zozname s odškrtávaním
  "span",
];

// Zvýrazňovač smie nastaviť len farbu pozadia — nič iné cez `style` neprejde.
// Pozor: sanitize-html porovnáva HODNOTU vlastnosti, nie celú deklaráciu.
const COLOR_VALUE = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i];

export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      mark: ["data-color", "style"],
      ul: ["data-type"],
      li: ["data-checked", "data-type"],
      input: ["type", "checked", "disabled"],
      "*": ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"], // zabíja javascript: aj data:
    allowedSchemesAppliedToAttributes: ["href"],
    transformTags: {
      // Odkaz v poznámke otvorený v novej karte nesmie mať prístup k opener-u.
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
    allowedStyles: {
      mark: { "background-color": COLOR_VALUE },
    },
    // Prázdne <p> udržiavajú prázdne riadky — nesmú sa vyhodiť.
    nonTextTags: ["style", "script", "textarea", "option", "noscript"],
  });
}
