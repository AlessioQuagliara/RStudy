import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { useEffect } from "react";
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Code2,
  Highlighter,
  Table as TableIcon,
  Link as LinkIcon,
  Undo2,
  Redo2,
  MessageSquareQuote,
  Heading1,
  Heading2,
} from "lucide-react";
import { Callout } from "@/features/lessons/tiptap/calloutExtension";
import { DictationButton } from "@/features/lessons/shared/DictationButton";

export function LessonEditor({
  initialContent,
  onChange,
  editable = true,
}: {
  initialContent: JSONContent | null;
  onChange: (payload: { json: JSONContent; plainText: string }) => void;
  editable?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Highlight,
      Placeholder.configure({ placeholder: "Scrivi gli appunti della lezione..." }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Callout,
    ],
    content: initialContent ?? "",
    editable,
    editorProps: {
      attributes: { class: "tiptap-editor-content", "aria-label": "Editor appunti lezione" },
    },
    onUpdate: ({ editor: ed }) => {
      onChange({ json: ed.getJSON(), plainText: ed.getText() });
    },
  });

  useEffect(() => {
    return () => editor?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!editor) return null;

  const setLink = () => {
    const url = window.prompt("URL del link:");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div className="tiptap-editor rounded-box border-base-300 flex flex-col border">
      <div className="border-base-300 flex flex-wrap gap-1 border-b p-2" role="toolbar" aria-label="Formattazione">
        <ToolbarButton active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} label="Titolo 1">
          <Heading1 className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} label="Titolo 2">
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} label="Grassetto">
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} label="Corsivo">
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} label="Sottolineato">
          <UnderlineIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} label="Barrato">
          <Strikethrough className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()} label="Evidenzia">
          <Highlighter className="size-4" />
        </ToolbarButton>
        <div className="divider divider-horizontal mx-0" />
        <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Elenco puntato">
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Elenco numerato">
          <ListOrdered className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} label="Checklist">
          <ListTodo className="size-4" />
        </ToolbarButton>
        <div className="divider divider-horizontal mx-0" />
        <ToolbarButton active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="Citazione">
          <Quote className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("callout")} onClick={() => editor.chain().focus().toggleCallout().run()} label="Callout">
          <MessageSquareQuote className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} label="Blocco codice">
          <Code2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("link")} onClick={setLink} label="Link">
          <LinkIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          label="Inserisci tabella"
        >
          <TableIcon className="size-4" />
        </ToolbarButton>
        <div className="divider divider-horizontal mx-0" />
        <DictationButton editor={editor} />
        <div className="divider divider-horizontal mx-0" />
        <ToolbarButton active={false} onClick={() => editor.chain().focus().undo().run()} label="Annulla">
          <Undo2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton active={false} onClick={() => editor.chain().focus().redo().run()} label="Ripeti">
          <Redo2 className="size-4" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} className="min-h-64 p-4" />
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-xs ${active ? "btn-active" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
    >
      {children}
    </button>
  );
}
