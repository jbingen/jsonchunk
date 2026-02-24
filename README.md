# 🧩 jsonchunk

[![npm version](https://img.shields.io/npm/v/jsonchunk)](https://www.npmjs.com/package/jsonchunk)
[![npm bundle size](https://img.shields.io/npm/unpacked-size/jsonchunk)](https://www.npmjs.com/package/jsonchunk)
[![license](https://img.shields.io/github/license/jbingen/jsonchunk)](https://github.com/jbingen/jsonchunk/blob/main/LICENSE)

Parse partial JSON as it streams in. Type-safe, tiny, built for LLM output.

For anyone tired of waiting for a complete JSON response before updating the UI.

```
npm install jsonchunk
```

```typescript
// before: wait for the full response, then parse
const result = JSON.parse(await response.text()); // blocks until done

// after: get a usable object on every chunk
for await (const partial of parseStream<User>(stream)) {
  render(partial); // updates live as tokens arrive
}
```

LLMs stream structured output token by token. Normal parsers fail on incomplete JSON. jsonchunk extracts a best-effort typed object from whatever has arrived so far.

```typescript
import { parse } from 'jsonchunk';

parse('{"name": "Alice", "age": 30}')
// { name: "Alice", age: 30 }

parse('{"name": "Ali')
// { name: "Ali" }

parse('{"name": "Alice", "hobbies": ["re')
// { name: "Alice", hobbies: ["re"] }

parse('{"name": "Alice", "age":')
// { name: "Alice" }
```

## Why

Every app consuming streamed LLM output needs this. The JSON arrives broken:

```json
{"user": {"name": "Alice", "age":
```

`JSON.parse` throws. So teams write ad-hoc recovery logic, regex hacks, or pull in a full framework just to show partial results. jsonchunk is the missing primitive: a tolerant parser that returns what it can, typed as `DeepPartial<T>`.

## API

### `parse<T>(input)`

Parse a partial JSON string. Returns `DeepPartial<T> | undefined`.

```typescript
import { parse, type DeepPartial } from 'jsonchunk';

type User = { name: string; age: number; tags: string[] };

const result = parse<User>('{"name": "Ali');
//    ^? DeepPartial<User> | undefined
// result = { name: "Ali" }
```

Returns `undefined` if nothing meaningful can be extracted yet (empty input, whitespace only).

### `createParser<T>()`

Push-based parser. Accumulates chunks and exposes the latest snapshot.

```typescript
import { createParser } from 'jsonchunk';

type User = { name: string; age: number };
const parser = createParser<User>();

parser.push('{"name": "Ali');
parser.value // { name: "Ali" }

parser.push('ce", "age": 30}');
parser.value // { name: "Alice", age: 30 }

parser.reset(); // reuse across requests
parser.value // undefined
```

### `parseStream<T>(source)`

Async generator that yields `DeepPartial<T>` snapshots from a `ReadableStream<string>` or `AsyncIterable<string>`.

```typescript
import { parseStream } from 'jsonchunk';

type User = { name: string; age: number; hobbies: string[] };

const response = await fetch('/api/user', { /* streaming */ });
const stream = response.body!.pipeThrough(new TextDecoderStream());

for await (const partial of parseStream<User>(stream)) {
  console.log(partial.name);    // updates live
  console.log(partial.hobbies); // grows as tokens arrive
}
```

### `createStream<T>()`

`TransformStream` adapter. Takes string chunks, emits `DeepPartial<T>` snapshots. Useful for piping.

```typescript
import { createStream } from 'jsonchunk';

type ToolCall = { function: string; arguments: Record<string, string> };

const snapshots = response.body!
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(createStream<ToolCall>());
```

### `DeepPartial<T>`

Recursive partial type. Every field becomes optional, all the way down.

```typescript
import type { DeepPartial } from 'jsonchunk';

type User = { name: string; address: { city: string; zip: number } };

type Partial = DeepPartial<User>;
// { name?: string; address?: { city?: string; zip?: number } }
```

## What it handles

The parser is tolerant of all the ways JSON can be incomplete mid-stream:

- **Partial strings**: `"hel` → `"hel"`
- **Partial objects**: `{"a": 1, "b":` → `{ a: 1 }`
- **Partial arrays**: `[1, 2, "thr` → `[1, 2, "thr"]`
- **Partial numbers**: `3.` → `3`, `1e` → `1`
- **Partial keywords**: `tru` → `true`, `fal` → `false`, `nu` → `null`
- **String escapes**: `\"`, `\\`, `\n`, `\uXXXX` handled across chunk boundaries
- **Trailing commas**: `{"a": 1,}` → `{ a: 1 }`
- **Nested structures**: works at any depth

Keys without values are omitted. Values without complete keys are omitted. The parser returns the largest valid partial object it can build.

## Design decisions

- Zero dependencies. ~5KB bundled.
- Re-parses the full accumulated string on each push. Simple, correct, and fast enough for LLM payloads (<100KB typical).
- Returns `DeepPartial<T>`. The type itself communicates "any field might not be here yet."
- Numbers are emitted immediately even if potentially incomplete (`3` might become `32`). For streaming UIs this is the right tradeoff.
- Partial keywords are resolved eagerly. `t` can only be `true`, `f` can only be `false`, `n` can only be `null`.
- No SAX/event model. You get an object, not a stream of tokens.
- No schema validation. Pair with zod if you need runtime validation on the final result.
