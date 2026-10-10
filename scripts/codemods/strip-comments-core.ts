import { parse as parseSfc } from "@vue/compiler-sfc";
import { parseSync } from "oxc-parser";
import postcss from "postcss";

interface CommentSpan {
  start: number;
  end: number;
  text: string;
}

interface StripResult {
  output: string;
  removed: CommentSpan[];
}

interface RawComment {
  type: "Line" | "Block";
  value: string;
  start: number;
  end: number;
}

interface TemplateNode {
  type: number;
  loc: { start: { offset: number }; end: { offset: number } };
  children?: unknown;
}

/**
 * Расширения, которые codemod вообще трогает.
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = [".ts", ".vue"];

/**
 * Комментарии, которые codemod обязан сохранить.
 */
export const PRESERVED_COMMENT_PATTERNS: readonly RegExp[] = [
  /^\s*@ts-(?:expect-error|ignore|nocheck|check)\b/,
  /^\s*eslint-(?:disable|enable)/,
  /^\s*eslint-env\b/,
  /^\s*biome-ignore\b/,
  /^\s*v8\s+ignore\b/,
  /^\/\s*<reference\b/,
  /^!/,
  /@vite-ignore/,
  /^\s*#__PURE__\s*$|^\s*@__PURE__\s*$|^\s*#__NO_SIDE_EFFECTS__\s*$/,
];

/**
 * Проверяет, что комментарий нужно сохранить (JSDoc или директива).
 *
 * @param comment - комментарий, найденный парсером.
 * @returns `true`, если комментарий нельзя удалять.
 */
function isPreserved(comment: RawComment): boolean {
  const isJsDoc = comment.type === "Block" && comment.value.startsWith("*");

  return isJsDoc || PRESERVED_COMMENT_PATTERNS.some((pattern) => pattern.test(comment.value));
}

/**
 * Собирает удаляемые комментарии скрипта через oxc-parser.
 *
 * @param code - исходный код скрипта.
 * @param filename - имя файла для парсера (по расширению выбирается язык).
 * @param offset - смещение начала `code` в исходном файле (для `.vue`-блоков).
 *
 * @returns диапазоны комментариев в абсолютных смещениях исходного файла.
 */
function collectScriptSpans(code: string, filename: string, offset: number): CommentSpan[] {
  const { comments } = parseSync(filename, code, { lang: filename.endsWith(".vue") ? "ts" : undefined });

  return (comments as RawComment[])
    .filter((comment) => !isPreserved(comment))
    .map((comment) => ({
      start: comment.start + offset,
      end: comment.end + offset,
      text: code.slice(comment.start, comment.end),
    }));
}

/**
 * Собирает удаляемые `<!-- -->` из AST шаблона.
 *
 * @param source - исходный текст всего `.vue`-файла.
 * @param templateAst - AST шаблона из `@vue/compiler-sfc`.
 * @returns диапазоны комментариев в абсолютных смещениях исходного файла.
 */
function collectTemplateSpans(source: string, templateAst: unknown): CommentSpan[] {
  const spans: CommentSpan[] = [];

  /**
   * Рекурсивно обходит узлы шаблона и копит comment-узлы.
   *
   * @param node - текущий узел AST.
   */
  const walk = (node: TemplateNode) => {
    if (node.type === 3) {
      const text = source.slice(node.loc.start.offset, node.loc.end.offset);
      const body = text.replace(/^<!--/, "").replace(/-->$/, "");

      if (PRESERVED_COMMENT_PATTERNS.every((pattern) => !pattern.test(body))) {
        spans.push({ start: node.loc.start.offset, end: node.loc.end.offset, text });
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (typeof child === "object" && child !== null) {
          walk(child as TemplateNode);
        }
      }
    }
  };

  walk(templateAst as TemplateNode);

  return spans;
}

/**
 * Собирает удаляемые комментарии блока `style` через postcss.
 *
 * @param content - содержимое блока `style`.
 * @param offset - смещение начала блока в исходном `.vue`-файле.
 * @returns диапазоны комментариев в абсолютных смещениях исходного файла.
 */
function collectStyleSpans(content: string, offset: number): CommentSpan[] {
  const spans: CommentSpan[] = [];

  postcss.parse(content).walkComments((comment) => {
    const start = comment.source?.start?.offset;
    const end = comment.source?.end?.offset;

    if (
      !start ||
      !end ||
      comment.text.startsWith("!") ||
      PRESERVED_COMMENT_PATTERNS.some((pattern) => pattern.test(comment.text))
    ) {
      return;
    }

    spans.push({ start: start + offset, end: end + 1 + offset, text: content.slice(start, end + 1) });
  });

  return spans;
}

/**
 * Находит все комментарии, которые подлежат удалению, в абсолютных смещениях исходника.
 *
 * @param source - исходный текст файла.
 * @param filename - имя файла; по расширению выбирается способ разбора (`.vue` или скрипт).
 * @returns диапазоны комментариев, отсортированные по возрастанию начала (для `.vue`).
 */
export function findRemovableComments(source: string, filename: string): CommentSpan[] {
  if (!filename.endsWith(".vue")) {
    return collectScriptSpans(source, filename, 0);
  }

  const { descriptor } = parseSfc(source, { filename });
  const spans: CommentSpan[] = [];

  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block) {
      continue;
    }

    const lang = block.lang === "tsx" ? "tsx" : "ts";
    spans.push(...collectScriptSpans(block.content, `${filename}.${lang}`, block.loc.start.offset));
  }

  if (descriptor.template?.ast) {
    spans.push(...collectTemplateSpans(source, descriptor.template.ast));
  }

  for (const style of descriptor.styles) {
    spans.push(...collectStyleSpans(style.content, style.loc.start.offset));
  }

  return spans.toSorted((a, b) => a.start - b.start);
}

/**
 * Вырезает диапазоны с конца к началу и подчищает осиротевшие пустые строки.
 *
 * @param source - исходный текст файла.
 * @param spans - диапазоны комментариев для удаления.
 * @returns текст без комментариев; пустая строка, если остались одни комментарии.
 */
export function applyRemovals(source: string, spans: readonly CommentSpan[]): string {
  let output = source;

  const fromEnd = spans.toSorted((a, b) => b.start - a.start);

  for (const span of fromEnd) {
    let start = span.start;
    let end = span.end;

    const lineStart = output.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = output.indexOf("\n", end);

    if (lineEnd === -1) {
      lineEnd = output.length;
    }

    const before = output.slice(lineStart, start);
    const after = output.slice(end, lineEnd);

    if (before.trim() === "" && after.trim() === "") {
      start = lineStart;
      end = Math.min(lineEnd + 1, output.length);

      const prevBlank = start >= 2 && output[start - 1] === "\n" && output[start - 2] === "\n";

      while ((prevBlank || start === 0) && output[end] === "\n") {
        end += 1;
      }
    } else if (after.trim() === "") {
      start = lineStart + before.trimEnd().length;
    } else if (before.trim() === "") {
      end += after.length - after.trimStart().length;
    } else if (/\s$/.test(before) && /^\s/.test(after)) {
      end += 1;
    }

    output = output.slice(0, start) + output.slice(end);
  }

  return output.trim() === "" ? "" : output;
}

/**
 * Удаляет все несохраняемые комментарии. Вторая и последующие обработки результата не меняют его.
 *
 * @param source - исходный текст файла.
 * @param filename - имя файла; по расширению выбирается способ разбора.
 * @returns текст без комментариев и список удалённых диапазонов.
 */
export function stripComments(source: string, filename: string): StripResult {
  const removed = findRemovableComments(source, filename);

  return { output: applyRemovals(source, removed), removed };
}

/**
 * Номер строки (с 1) для смещения в исходнике.
 *
 * @param source - исходный текст файла.
 * @param offset - смещение в символах от начала `source`.
 * @returns номер строки, на которую попадает смещение.
 */
export function lineOf(source: string, offset: number): number {
  let line = 1;

  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }

  return line;
}
