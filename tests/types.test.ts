import { parse, createParser, parseStream, type DeepPartial } from '../src/index';

type AssertEqual<T, U> = [T] extends [U] ? [U] extends [T] ? true : never : never;
function typeEqual<T, U>(_: AssertEqual<T, U>) {}

type User = { name: string; age: number };
type Nested = { user: { name: string; tags: string[] } };

// DeepPartial leaves primitives alone
typeEqual<DeepPartial<string>, string>(true);
typeEqual<DeepPartial<number>, number>(true);
typeEqual<DeepPartial<boolean>, boolean>(true);
typeEqual<DeepPartial<null>, null>(true);

// DeepPartial makes object fields optional recursively
typeEqual<DeepPartial<User>, { name?: string; age?: number }>(true);
typeEqual<DeepPartial<Nested>, { user?: { name?: string; tags?: string[] } }>(true);

// arrays pass through, arrays of objects get partial elements
typeEqual<DeepPartial<string[]>, string[]>(true);
typeEqual<DeepPartial<User[]>, DeepPartial<User>[]>(true);

// readonly arrays stay readonly
typeEqual<DeepPartial<readonly string[]>, readonly string[]>(true);
typeEqual<DeepPartial<readonly User[]>, readonly DeepPartial<User>[]>(true);

// typed parse returns DeepPartial<T> | undefined
const result = parse<User>('{"name": "Alice"}');
typeEqual<typeof result, DeepPartial<User> | undefined>(true);

// createParser.value matches
const parser = createParser<User>();
typeEqual<typeof parser.value, DeepPartial<User> | undefined>(true);

// untyped parse returns unknown
const untyped = parse('{}');
typeEqual<typeof untyped, unknown>(true);

// parseStream yields DeepPartial<T>
async function checkStreamTypes() {
  async function* src() { yield '{}'; }
  for await (const snap of parseStream<User>(src())) {
    typeEqual<typeof snap, DeepPartial<User>>(true);
  }
}
