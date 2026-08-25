import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Nodo Tiptap minimale per i blocchi callout (stile Notion): un contenitore
 * a blocco che può ospitare paragrafi/liste, con stile dedicato in
 * tailwind.css (.tiptap-editor .ProseMirror .callout).
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-type='callout']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "callout" }), 0];
  },

  addCommands() {
    return {
      toggleCallout:
        () =>
        ({ commands }) => {
          return commands.wrapIn(this.name) || commands.lift(this.name);
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      toggleCallout: () => ReturnType;
    };
  }
}
