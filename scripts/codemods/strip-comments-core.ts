import { parse as parseSfc } from "@vue/compiler-sfc";
import { parseSync } from "oxc-parser";
import postcss from "postcss";

export interface CommentSpan {
  start: number;
  end: number;
  text: string;
}

export interface StripResult {
  output: string;
  removed: CommentSpan[];
}

/**
 * Расширения, которые codemod вообще трогает.
 *
 * @remarks
 * Список явный, а не «всё, кроме»: `.sh`, `Dockerfile`, `Caddyfile`, `compose.yaml` и `.md` несут
 * документацию для того, кто разворачивает проект, и удалять из них комментарии нельзя.
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = [".ts", ".vue"];

/**
 * Комментарии, которые codemod обязан сохранить.
 *
 * @remarks
 * Молчаливое удаление директив меняет поведение сборки или линтера, поэтому правила проверяются по
 * тексту комментария (без обрамляющих `//` и `/* *\/`). JSDoc (`/** *\/`) сохраняется отдельным условием.
 */
export const PRESERVED_COMMENT_PATTERNS: readonly RegExp[] = [
  /^\s*@ts-(?:expect-error|ignore|nocheck|check)\b/,
  /^\s*(?:eslint|oxlint)-(?:disable|enable)/,
  /^\s*eslint-env\b/,
  /^\s*biome-ignore\b/,
  /^\s*prettier-ignore\b/,
  /^\s*istanbul\s+ignore\b/,
  /^\s*c8\s+ignore\b/,
  /^\s*v8\s+ignore\b/,
  /^\/\s*<reference\b/,
  /^!/,
  /webpackChunkName|webpackIgnore|@vite-ignore/,
  /^\s*#__PURE__\s*$|^\s*@__PURE__\s*$|^\s*#__NO_SIDE_EFFECTS__\s*$/,
];

interface RawComment {
  type: "Line" | "Block";
  value: string;
  start: number;
  end: number;
}

function isPreserved(comment: RawComment): boolean {
  const isJsDoc = comment.type === "Block" && comment.value.startsWith("*");
  return isJsDoc || PRESERVED_COMMENT_PATTERNS.some((pattern) => pattern.test(comment.value));
}

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

function collectTemplateSpans(source: string, templateAst: unknown): CommentSpan[] {
  const spans: CommentSpan[] = [];
  const walk = (node: {
    type: number;
    loc: { start: { offset: number }; end: { offset: number } };
    children?: unknown;
  }) => {
    // NodeTypes.COMMENT === 3
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
          walk(child as Parameters<typeof walk>[0]);
        }
      }
    }
  };
  walk(templateAst as Parameters<typeof walk>[0]);
  return spans;
}

function collectStyleSpans(content: string, offset: number): CommentSpan[] {
  const spans: CommentSpan[] = [];
  postcss.parse(content).walkComments((comment) => {
    const start = comment.source?.start?.offset;
    const end = comment.source?.end?.offset;
    if (
      start === undefined ||
      end === undefined ||
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
 * @remarks
 * `.vue` разбирается по блокам SFC: `script` отдаётся oxc-parser, `<!-- -->` снимаются по
 * comment-узлам AST шаблона (не regex — он ломается на `-->` внутри атрибута), `style` обходит postcss.
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
 * @remarks
 * Комментарий, стоявший на отдельной строке, уходит вместе со строкой целиком. Хвостовой комментарий
 * после кода уходит вместе с пробелами перед ним. Подряд идущие пустые строки схлопываются до одной
 * только в местах удаления — остальной файл не трогается, чтобы прогон был идемпотентным.
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
      // не оставлять две пустые строки подряд там, где вырезан комментарий
      const prevBlank = start >= 2 && output[start - 1] === "\n" && output[start - 2] === "\n";
      while ((prevBlank || start === 0) && output[end] === "\n") {
        end += 1;
      }
    } else if (after.trim() === "") {
      start = lineStart + before.trimEnd().length;
    } else if (before.trim() === "") {
      // комментарий в начале строки перед кодом: убираем и пробел после него
      end += after.length - after.trimStart().length;
    } else if (/\s$/.test(before) && /^\s/.test(after)) {
      end += 1;
    }

    output = output.slice(0, start) + output.slice(end);
  }

  // файл, состоявший из одних комментариев, превращается в пустой, а не в набор переводов строки
  return output.trim() === "" ? "" : output;
}

/** Удаляет все несохраняемые комментарии. Вторая и последующие обработки результата не меняют его. */
export function stripComments(source: string, filename: string): StripResult {
  const removed = findRemovableComments(source, filename);
  return { output: applyRemovals(source, removed), removed };
}

/** Номер строки (с 1) для смещения в исходнике. */
export function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }
  return line;
}
