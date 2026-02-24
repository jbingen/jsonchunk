export type DeepPartial<T> =
  T extends (infer U)[] ? DeepPartial<U>[] :
  T extends readonly (infer U)[] ? readonly DeepPartial<U>[] :
  T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } :
  T;

export type Parser<T = unknown> = {
  push(chunk: string): void;
  reset(): void;
  readonly value: DeepPartial<T> | undefined;
};

type ParseResult = { value: unknown; end: number };

function skipWs(s: string, i: number): number {
  while (i < s.length) {
    const c = s[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
    else break;
  }
  return i;
}

function parseValue(s: string, i: number): ParseResult | undefined {
  i = skipWs(s, i);
  if (i >= s.length) return undefined;

  const c = s[i]!;
  if (c === '"') return parseString(s, i);
  if (c === '{') return parseObject(s, i);
  if (c === '[') return parseArray(s, i);
  if (c === '-' || (c >= '0' && c <= '9')) return parseNumber(s, i);
  if (c === 't') return parseLiteral(s, i, 'true', true);
  if (c === 'f') return parseLiteral(s, i, 'false', false);
  if (c === 'n') return parseLiteral(s, i, 'null', null);
  return undefined;
}

// "t" can only start "true" in valid JSON, so partial prefix is unambiguous
function parseLiteral(s: string, i: number, word: string, value: unknown): ParseResult | undefined {
  const remaining = s.slice(i, i + word.length);
  if (word.startsWith(remaining)) {
    return { value, end: i + remaining.length };
  }
  return undefined;
}

function parseString(s: string, i: number): ParseResult {
  i++;
  let result = '';

  while (i < s.length) {
    const c = s[i]!;
    if (c === '"') return { value: result, end: i + 1 };
    if (c === '\\') {
      i++;
      if (i >= s.length) break;
      const esc = s[i]!;
      if (esc === '"' || esc === '\\' || esc === '/') result += esc;
      else if (esc === 'b') result += '\b';
      else if (esc === 'f') result += '\f';
      else if (esc === 'n') result += '\n';
      else if (esc === 'r') result += '\r';
      else if (esc === 't') result += '\t';
      else if (esc === 'u') {
        const hex = s.slice(i + 1, i + 5);
        if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
          result += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          break;
        }
      } else {
        result += esc;
      }
    } else {
      result += c;
    }
    i++;
  }

  // input ended mid-string - return what we have
  return { value: result, end: i };
}

function parseNumber(s: string, i: number): ParseResult | undefined {
  let end = i;
  if (s[end] === '-') end++;
  while (end < s.length && s[end]! >= '0' && s[end]! <= '9') end++;
  if (end < s.length && s[end] === '.') {
    end++;
    while (end < s.length && s[end]! >= '0' && s[end]! <= '9') end++;
  }
  if (end < s.length && (s[end] === 'e' || s[end] === 'E')) {
    end++;
    if (end < s.length && (s[end] === '+' || s[end] === '-')) end++;
    while (end < s.length && s[end]! >= '0' && s[end]! <= '9') end++;
  }

  // strip trailing incomplete parts like "1e" or "3." back to last digit
  let numEnd = end;
  while (numEnd > i) {
    const last = s[numEnd - 1]!;
    if (last >= '0' && last <= '9') break;
    numEnd--;
  }
  if (numEnd === i) return undefined;
  return { value: Number(s.slice(i, numEnd)), end };
}

function parseObject(s: string, i: number): ParseResult {
  i++;
  const result: Record<string, unknown> = {};

  while (true) {
    i = skipWs(s, i);
    if (i >= s.length) break;
    if (s[i] === '}') { i++; break; }
    if (s[i] === ',') { i++; continue; }

    if (s[i] !== '"') break;
    const key = parseString(s, i);
    i = key.end;

    i = skipWs(s, i);
    if (i >= s.length || s[i] !== ':') break;
    i++;

    const val = parseValue(s, i);
    if (!val) break;
    result[key.value as string] = val.value;
    i = val.end;

    i = skipWs(s, i);
    if (i >= s.length) break;
    if (s[i] === ',') { i++; continue; }
    if (s[i] === '}') { i++; break; }
    break;
  }

  return { value: result, end: i };
}

function parseArray(s: string, i: number): ParseResult {
  i++;
  const result: unknown[] = [];

  while (true) {
    i = skipWs(s, i);
    if (i >= s.length) break;
    if (s[i] === ']') { i++; break; }
    if (s[i] === ',') { i++; continue; }

    const val = parseValue(s, i);
    if (!val) break;
    result.push(val.value);
    i = val.end;

    i = skipWs(s, i);
    if (i >= s.length) break;
    if (s[i] === ',') { i++; continue; }
    if (s[i] === ']') { i++; break; }
    break;
  }

  return { value: result, end: i };
}

export function parse<T = unknown>(input: string): DeepPartial<T> | undefined {
  const result = parseValue(input, 0);
  return result?.value as DeepPartial<T> | undefined;
}

export function createParser<T = unknown>(): Parser<T> {
  let buffer = '';
  let current: DeepPartial<T> | undefined;

  return {
    push(chunk: string) {
      buffer += chunk;
      current = parse<T>(buffer);
    },
    reset() {
      buffer = '';
      current = undefined;
    },
    get value() {
      return current;
    },
  };
}

export function createStream<T = unknown>(): TransformStream<string, DeepPartial<T>> {
  const parser = createParser<T>();
  return new TransformStream({
    transform(chunk, controller) {
      parser.push(chunk);
      if (parser.value !== undefined) {
        controller.enqueue(parser.value);
      }
    },
  });
}

export async function* parseStream<T = unknown>(
  source: ReadableStream<string> | AsyncIterable<string>,
): AsyncGenerator<DeepPartial<T>> {
  const parser = createParser<T>();
  const iter: AsyncIterable<string> =
    Symbol.asyncIterator in source
      ? (source as AsyncIterable<string>)
      : readableToIterable(source as ReadableStream<string>);

  for await (const chunk of iter) {
    parser.push(chunk);
    if (parser.value !== undefined) {
      yield parser.value;
    }
  }
}

// ReadableStream isn't async iterable in all runtimes
async function* readableToIterable<T>(stream: ReadableStream<T>): AsyncIterable<T> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
