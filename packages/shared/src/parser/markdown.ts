export interface WikiLink {
  target: string;
  alias?: string;
  from: number;
  to: number;
  line: number;
}

export interface TagEntry {
  name: string;
  from: number;
  to: number;
  line: number;
}

export interface FrontmatterData {
  title?: string;
  tags?: string[];
  date?: string;
  [key: string]: unknown;
}

export interface ParseResult {
  wikiLinks: WikiLink[];
  tags: TagEntry[];
  frontmatter: FrontmatterData | null;
  title: string;
}

const WIKI_LINK_REGEX = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
const TAG_REGEX = /(?:^|\s)#([a-zA-Z\u4e00-\u9fff][\w\u4e00-\u9fff-/]*)/g;
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

export function parseMarkdown(content: string): ParseResult {
  const wikiLinks: WikiLink[] = [];
  const tags: TagEntry[] = [];

  let match: RegExpExecArray | null;

  const lines = content.split('\n');
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    const lineOffset = lines.slice(0, lineIdx).join('\n').length + (lineIdx > 0 ? 1 : 0);

    WIKI_LINK_REGEX.lastIndex = 0;
    while ((match = WIKI_LINK_REGEX.exec(line)) !== null) {
      wikiLinks.push({
        target: match[1]!.trim(),
        alias: match[2]?.trim(),
        from: lineOffset + match.index,
        to: lineOffset + match.index + match[0].length,
        line: lineIdx,
      });
    }

    TAG_REGEX.lastIndex = 0;
    while ((match = TAG_REGEX.exec(line)) !== null) {
      tags.push({
        name: match[1]!.trim(),
        from: lineOffset + match.index + 1,
        to: lineOffset + match.index + match[0].length,
        line: lineIdx,
      });
    }
  }

  let frontmatter: FrontmatterData | null = null;
  const fmMatch = FRONTMATTER_REGEX.exec(content);
  if (fmMatch) {
    frontmatter = parseYamlFrontmatter(fmMatch[1]!);
  }

  let title = '';
  if (frontmatter?.title) {
    title = frontmatter.title;
  } else {
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1]!.trim();
    }
  }

  return { wikiLinks, tags, frontmatter, title };
}

function parseYamlFrontmatter(yaml: string): FrontmatterData {
  const data: FrontmatterData = {};
  const lines = yaml.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (!key) continue;

    if (key === 'tags') {
      if (value.startsWith('[') && value.endsWith(']')) {
        data.tags = value
          .slice(1, -1)
          .split(',')
          .map((t) => t.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else {
        data.tags = [value];
      }
    } else if (value === 'true') {
      (data as Record<string, unknown>)[key] = true;
    } else if (value === 'false') {
      (data as Record<string, unknown>)[key] = false;
    } else if (/^\d+$/.test(value)) {
      (data as Record<string, unknown>)[key] = parseInt(value, 10);
    } else {
      (data as Record<string, unknown>)[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return data;
}

export function pathToNoteId(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  const filename = parts[parts.length - 1]!;
  return filename.replace(/\.(md|markdown)$/, '');
}

export function noteIdToPath(vaultPath: string, noteId: string): string {
  const base = vaultPath.replace(/\/$/, '');
  return `${base}/${noteId}.md`;
}
