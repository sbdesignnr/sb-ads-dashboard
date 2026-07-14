"use client";

import { useCallback, useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Heading2,
  Heading3,
  Link2,
  Undo2,
  Redo2,
  Highlighter,
  Eraser,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Zvýrazňovač nie je paleta na maľovanie — každá farba niečo znamená. Keď sa
 * držíš jedného kľúča, poznámky sa dajú skenovať očami: zelená = čo urobiť,
 * ružová = kde mám otázku. Legenda je vždy na očiach pod editorom.
 */
export const HIGHLIGHTS = [
  { color: "#facc15", label: "Dôležité" },
  { color: "#4ade80", label: "Vyskúšať v praxi" },
  { color: "#60a5fa", label: "Myšlienka / koncept" },
  { color: "#f472b6", label: "Otázka / nesúhlasím" },
  { color: "#c084fc", label: "Citát" },
] as const;

/**
 * Pôvodné rozšírenie píše do značky natvrdo `color: inherit`. V tmavej téme by
 * to znamenalo takmer biele písmo na svetložltom podklade — teda nečitateľné.
 * Vypúšťame teda len farbu pozadia a farbu písma nechávame na CSS (tmavá).
 */
const ColorHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) =>
          el.getAttribute("data-color") || el.style.backgroundColor || null,
        renderHTML: (attrs) =>
          attrs.color
            ? {
                "data-color": attrs.color as string,
                style: `background-color: ${attrs.color}`,
              }
            : {},
      },
    };
  },
}).configure({ multicolor: true });

function ToolBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // Mousedown by editoru najprv zobral fokus a príkaz by nemal na čom bežať.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        "flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-primary text-white"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Odkaz (URL):", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    // Len http(s) — inak by sa dal do poznámky prepašovať javascript: odkaz.
    if (!/^https?:\/\//i.test(url.trim())) {
      window.alert("Odkaz musí začínať na http:// alebo https://");
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  }, [editor]);

  const sep = <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />;

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-border bg-surface-2/60 px-1.5 py-1">
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Tučné (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Šikmé (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Podčiarknuté (Ctrl+U)"
      >
        <Underline className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Prečiarknuté"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolBtn>

      {sep}

      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Nadpis"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Podnadpis"
      >
        <Heading3 className="h-3.5 w-3.5" />
      </ToolBtn>

      {sep}

      <ToolBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Odrážky"
      >
        <List className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Číslovaný zoznam"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
        title="Zoznam s odškrtávaním"
      >
        <ListChecks className="h-3.5 w-3.5" />
      </ToolBtn>
      <ToolBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Citát"
      >
        <Quote className="h-3.5 w-3.5" />
      </ToolBtn>

      {sep}

      {/* Zvýrazňovače — každá farba má význam (legenda pod editorom). */}
      {HIGHLIGHTS.map((h) => (
        <button
          key={h.color}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            editor.chain().focus().toggleHighlight({ color: h.color }).run()
          }
          title={`Zvýrazniť: ${h.label}`}
          aria-label={`Zvýrazniť: ${h.label}`}
          aria-pressed={editor.isActive("highlight", { color: h.color })}
          className={cn(
            "h-5 w-5 shrink-0 cursor-pointer rounded-full border-2 transition-transform hover:scale-110",
            editor.isActive("highlight", { color: h.color })
              ? "border-foreground scale-110"
              : "border-transparent",
          )}
          style={{ backgroundColor: h.color }}
        />
      ))}
      <ToolBtn
        onClick={() => editor.chain().focus().unsetHighlight().run()}
        disabled={!editor.isActive("highlight")}
        title="Zrušiť zvýraznenie"
      >
        <Eraser className="h-3.5 w-3.5" />
      </ToolBtn>

      {sep}

      <ToolBtn onClick={setLink} active={editor.isActive("link")} title="Odkaz">
        <Link2 className="h-3.5 w-3.5" />
      </ToolBtn>

      <span className="ml-auto flex items-center gap-0.5">
        <ToolBtn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Späť (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Dopredu (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </ToolBtn>
      </span>
    </div>
  );
}

export function NoteEditor({
  content,
  onChange,
  placeholder = "Píš poznámky… Vyber text a zvýrazni ho farbou.",
}: {
  content: string;
  /** Volá sa až po ~800 ms ticha, nie pri každom stlačení klávesy. */
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  const editor = useEditor({
    // Bez tohto Next pri SSR vypíše hydration warning.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https"],
        },
      }),
      ColorHighlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "tiptap min-h-[160px] px-3 py-2 focus:outline-none",
      },
    },
    // Ukladá sa samo, s odkladom — inak by každé písmeno išlo na server.
    onUpdate: ({ editor }) => {
      if (timer.current) clearTimeout(timer.current);
      const html = editor.getHTML();
      timer.current = setTimeout(() => latest.current(html), 800);
    },
  });

  // Odchod zo stránky uprostred odkladu by rozpísanú vetu zahodil — pri odpojení
  // editora čakajúci zápis ešte dobehne.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (editor && !editor.isDestroyed) latest.current(editor.getHTML());
      }
    };
  }, [editor]);

  if (!editor)
    return <div className="h-[200px] animate-pulse rounded-lg bg-surface-2" />;

  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent
        editor={editor}
        className="rounded-b-lg border border-border bg-surface-2 text-sm text-foreground focus-within:border-primary"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <Highlighter className="h-3 w-3" />
          Farby:
        </span>
        {HIGHLIGHTS.map((h) => (
          <span key={h.color} className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: h.color }}
            />
            {h.label}
          </span>
        ))}
      </div>
    </div>
  );
}
