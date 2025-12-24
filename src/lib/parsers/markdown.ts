// Markdown Parser - Parse and optionally convert markdown files
// Can extract plain text or keep markdown formatting

// Load marked from CDN dynamically
let marked: any = null;

async function loadMarked() {
  if (marked) return marked;

  // Load from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/marked/11.1.1/marked.min.js';
  document.head.appendChild(script);

  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });

  marked = (window as any).marked;
  return marked;
}

/**
 * Parse a markdown file
 * @param file - The markdown file
 * @param preserveFormatting - Keep markdown syntax or convert to plain text
 */
export async function parseMarkdownFile(
  file: File,
  preserveFormatting: boolean = true
): Promise<string> {
  try {
    console.log(`📝 Parsing Markdown file: ${file.name} (${file.size} bytes)`);

    // Read file as text
    const markdownText = await file.text();

    let result: string;

    if (preserveFormatting) {
      // Keep markdown syntax for better semantic chunking
      result = cleanMarkdown(markdownText);
    } else {
      // Convert to plain text (remove markdown syntax)
      result = await markdownToPlainText(markdownText);
    }

    console.log(`✅ Parsed ${result.length} characters from Markdown`);

    return result;
  } catch (error) {
    console.error('❌ Failed to parse Markdown file:', error);
    throw new Error(
      `Failed to parse Markdown file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Clean markdown text while preserving structure
 */
function cleanMarkdown(text: string): string {
  // Normalize line breaks
  let cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Remove excessive blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Trim each line
  cleaned = cleaned
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  return cleaned.trim();
}

/**
 * Convert markdown to plain text
 * Removes all markdown syntax
 */
async function markdownToPlainText(markdown: string): Promise<string> {
  // Load marked library
  const markedLib = await loadMarked();

  // Configure marked to output plain text
  markedLib.setOptions({
    renderer: createPlainTextRenderer(),
    breaks: true,
    gfm: true
  });

  // Parse markdown
  const html = await markedLib.parse(markdown);

  // Convert HTML to plain text
  const text = htmlToPlainText(html as string);

  return text;
}

/**
 * Create a custom renderer that outputs plain text
 */
function createPlainTextRenderer(): any {
  const renderer: any = {
    // Headings with extra spacing
    heading(text) {
      return `\n\n${text}\n\n`;
    },
    // Paragraphs
    paragraph(text) {
      return `${text}\n\n`;
    },
    // Lists
    list(body) {
      return `${body}\n`;
    },
    listitem(text) {
      return `• ${text}\n`;
    },
    // Code blocks
    code(code) {
      return `\n${code}\n\n`;
    },
    // Inline code
    codespan(code) {
      return code;
    },
    // Links - keep URL in parentheses
    link(href, title, text) {
      return `${text} (${href})`;
    },
    // Images - just the alt text
    image(href, title, text) {
      return text || '';
    },
    // Strong/em - just the text
    strong(text) {
      return text;
    },
    em(text) {
      return text;
    },
    // Line breaks
    br() {
      return '\n';
    },
    // Horizontal rules
    hr() {
      return '\n---\n';
    },
    // Tables - basic formatting
    table(header, body) {
      return `\n${header}${body}\n`;
    },
    tablerow(content) {
      return `${content}\n`;
    },
    tablecell(content) {
      return `${content} `;
    }
  };

  return renderer;
}

/**
 * Simple HTML to plain text conversion
 * Removes HTML tags and entities
 */
function htmlToPlainText(html: string): string {
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, '');

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Clean up excessive whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Validate if file is a markdown file
 */
export function isMarkdownFile(file: File): boolean {
  const mdExtensions = ['.md', '.markdown', '.mdown', '.mkd'];
  const fileName = file.name.toLowerCase();

  return mdExtensions.some(ext => fileName.endsWith(ext)) ||
         file.type === 'text/markdown';
}

/**
 * Extract metadata from markdown frontmatter (if present)
 */
export function extractFrontmatter(markdown: string): {
  metadata: Record<string, any>;
  content: string;
} {
  // Check for YAML frontmatter (--- at start)
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, content: markdown };
  }

  const [, frontmatter, content] = match;

  // Parse YAML frontmatter (simple key: value pairs)
  const metadata: Record<string, any> = {};
  frontmatter.split('\n').forEach(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      metadata[key] = value;
    }
  });

  return { metadata, content };
}
