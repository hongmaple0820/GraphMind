import { useRef, useEffect, useMemo } from 'react';
import { EditorState, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, rectangularSelection, highlightSpecialChars, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, defaultHighlightStyle, HighlightStyle } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { tags } from '@lezer/highlight';

const jumpToNote = StateEffect.define<string>();
export { jumpToNote };

class WikiLinkWidget extends WidgetType {
  constructor(readonly target: string, readonly alias?: string) { super(); }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-wiki-link';
    span.textContent = this.alias ?? this.target;
    span.dataset.target = this.target;
    span.setAttribute('role', 'link');
    span.setAttribute('tabindex', '0');
    return span;
  }
  ignoreEvent(event: Event) { return event.type !== 'click' && event.type !== 'keydown'; }
}

const WIKI_LINK_DECORATOR = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildWikiLinkDecorations(view); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildWikiLinkDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function buildWikiLinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    const regex = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      const target = match[1]?.trim() ?? '';
      const alias = match[2]?.trim();
      builder.add(start, end, Decoration.replace({ widget: new WikiLinkWidget(target, alias) }));
    }
  }
  return builder.finish();
}

const wikiLinkClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    const linkEl = (event.target as HTMLElement).closest('.cm-wiki-link') as HTMLElement | null;
    if (linkEl?.dataset.target) {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({ effects: jumpToNote.of(linkEl.dataset.target) });
      return true;
    }
    return false;
  },
});

const wikiLinkStyle = EditorView.baseTheme({
  '.cm-wiki-link': { color: '#818CF8', textDecoration: 'underline dotted', cursor: 'pointer', textUnderlineOffset: '2px' },
  '.cm-wiki-link:hover': { color: '#A5B4FC', backgroundColor: 'rgba(99, 102, 241, 0.1)', borderRadius: '2px' },
});

const wikiLinkCompletion = autocompletion({
  override: [(context) => {
    const textBefore = context.state.doc.sliceString(Math.max(0, context.pos - 50), context.pos);
    const match = textBefore.match(/\[\[([^\]]*?)$/);
    if (!match) return null;
    const query = match[1]?.toLowerCase() ?? '';
    const noteNames: string[] = (window as unknown as Record<string, string[]>).__graphmind_note_names__ ?? [];
    const filtered = noteNames.filter((n) => n.toLowerCase().includes(query));
    return { from: context.pos - (match[1]?.length ?? 0), options: filtered.slice(0, 20).map((name) => ({ label: name, type: 'text', apply: name + ']]', detail: 'note' })) };
  }],
});

const graphmindTheme = EditorView.theme({
  '&': { fontSize: '14px', lineHeight: '1.7', backgroundColor: 'var(--color-surface-base)', color: 'var(--color-text-primary)' },
  '.cm-content': { fontFamily: "'Inter', 'Noto Sans SC', sans-serif", padding: '16px 24px', caretColor: '#6366F1', maxWidth: '800px', margin: '0 auto' },
  '.cm-cursor': { borderLeftColor: '#6366F1', borderLeftWidth: '2px' },
  '.cm-activeLine': { backgroundColor: 'rgba(99, 102, 241, 0.04)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(99, 102, 241, 0.15) !important' },
  '.cm-gutters': { backgroundColor: 'transparent', color: '#475569', border: 'none', paddingRight: '8px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#94A3B8' },
});

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.6em', fontWeight: '700', color: '#F1F5F9', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.35em', fontWeight: '600', color: '#F1F5F9', lineHeight: '1.4' },
  { tag: tags.heading3, fontSize: '1.15em', fontWeight: '600', color: '#E0E7FF', lineHeight: '1.4' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#C7D2FE' },
  { tag: tags.strong, fontWeight: '700', color: '#E0E7FF' },
  { tag: tags.link, color: '#818CF8', textDecoration: 'underline' },
  { tag: tags.url, color: '#6366F1' },
  { tag: tags.monospace, color: '#10B981', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.9em' },
  { tag: tags.quote, color: '#94A3B8', fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: '#94A3B8' },
  { tag: tags.meta, color: '#475569' },
  { tag: tags.comment, color: '#475569' },
  { tag: tags.list, color: '#818CF8' },
]);

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.6em', fontWeight: '700', color: '#1E293B', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.35em', fontWeight: '600', color: '#1E293B', lineHeight: '1.4' },
  { tag: tags.heading3, fontSize: '1.15em', fontWeight: '600', color: '#312E81', lineHeight: '1.4' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#4338CA' },
  { tag: tags.strong, fontWeight: '700', color: '#312E81' },
  { tag: tags.link, color: '#4F46E5', textDecoration: 'underline' },
  { tag: tags.url, color: '#6366F1' },
  { tag: tags.monospace, color: '#059669', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.9em' },
  { tag: tags.quote, color: '#64748B', fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: '#64748B' },
  { tag: tags.meta, color: '#94A3B8' },
  { tag: tags.comment, color: '#94A3B8' },
  { tag: tags.list, color: '#4F46E5' },
]);

interface MarkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onSave?: (value: string) => void;
  onJumpToNote?: (target: string) => void;
  readOnly?: boolean;
}

export function MarkdownEditor({ value, onChange, onSave, onJumpToNote, readOnly = false }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onJumpRef = useRef(onJumpToNote);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onJumpRef.current = onJumpToNote;

  const isDark = typeof document !== 'undefined'
    && document.documentElement.getAttribute('data-theme') !== 'light';

  const highlightStyle = useMemo(() => isDark ? darkHighlightStyle : lightHighlightStyle, [isDark]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(), highlightSpecialChars(), history(), foldGutter(),
        drawSelection(), rectangularSelection(), indentOnInput(),
        bracketMatching(), closeBrackets(), highlightActiveLine(), highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        syntaxHighlighting(highlightStyle),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        wikiLinkCompletion,
        keymap.of([
          ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap,
          ...historyKeymap, ...foldKeymap, ...completionKeymap, indentWithTab,
          { key: 'Mod-s', run: (v) => { onSaveRef.current?.(v.state.doc.toString()); return true; } },
        ]),
        ...(isDark ? [oneDark] : []), graphmindTheme, wikiLinkStyle,
        WIKI_LINK_DECORATOR, wikiLinkClickHandler,
        EditorView.lineWrapping, EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
          for (const tr of update.transactions) {
            for (const eff of tr.effects) {
              if (eff.is(jumpToNote)) onJumpRef.current?.(eff.value);
            }
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({ changes: { from: 0, to: currentDoc.length, insert: value } });
    }
  }, [value]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" spellCheck={false} />;
}
