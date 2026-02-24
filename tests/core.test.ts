// @ts-nocheck
import { describe, test, expect } from 'bun:test';
import { parse, createParser, createStream, parseStream } from '../src/index';

describe('complete json', () => {
  test('string', () => expect(parse('"hello"')).toBe('hello'));
  test('number', () => expect(parse('42')).toBe(42));
  test('negative number', () => expect(parse('-7')).toBe(-7));
  test('float', () => expect(parse('3.14')).toBe(3.14));
  test('exponent', () => expect(parse('1e10')).toBe(1e10));
  test('true', () => expect(parse('true')).toBe(true));
  test('false', () => expect(parse('false')).toBe(false));
  test('null', () => expect(parse('null')).toBe(null));
  test('empty string', () => expect(parse('""')).toBe(''));
  test('empty object', () => expect(parse('{}')).toEqual({}));
  test('empty array', () => expect(parse('[]')).toEqual([]));

  test('object', () => {
    expect(parse('{"a": 1, "b": "two"}')).toEqual({ a: 1, b: 'two' });
  });

  test('array', () => {
    expect(parse('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  test('nested', () => {
    const input = '{"user": {"name": "Alice", "tags": ["admin", "dev"]}, "count": 2}';
    expect(parse(input)).toEqual({
      user: { name: 'Alice', tags: ['admin', 'dev'] },
      count: 2,
    });
  });

  test('whitespace is ignored', () => {
    expect(parse('  { "a" : 1 }  ')).toEqual({ a: 1 });
  });
});

describe('partial strings', () => {
  test('no closing quote', () => {
    expect(parse('"hello')).toBe('hello');
  });

  test('mid-word', () => {
    expect(parse('"hel')).toBe('hel');
  });

  test('just opening quote', () => {
    expect(parse('"')).toBe('');
  });
});

describe('partial objects', () => {
  test('just opening brace', () => {
    expect(parse('{')).toEqual({});
  });

  test('key with no colon', () => {
    expect(parse('{"name"')).toEqual({});
  });

  test('key with colon, no value', () => {
    expect(parse('{"name":')).toEqual({});
  });

  test('key with colon and space, no value', () => {
    expect(parse('{"name": ')).toEqual({});
  });

  test('partial string value', () => {
    expect(parse('{"name": "Ali')).toEqual({ name: 'Ali' });
  });

  test('complete first pair, partial second key', () => {
    expect(parse('{"name": "Alice", "ag')).toEqual({ name: 'Alice' });
  });

  test('complete first pair, second key no value', () => {
    expect(parse('{"name": "Alice", "age":')).toEqual({ name: 'Alice' });
  });

  test('complete first pair, partial second value', () => {
    expect(parse('{"name": "Alice", "age": 3')).toEqual({ name: 'Alice', age: 3 });
  });

  test('trailing comma', () => {
    expect(parse('{"a": 1, "b": 2,}')).toEqual({ a: 1, b: 2 });
  });

  test('trailing comma no close', () => {
    expect(parse('{"a": 1,')).toEqual({ a: 1 });
  });
});

describe('partial arrays', () => {
  test('just opening bracket', () => {
    expect(parse('[')).toEqual([]);
  });

  test('one complete element', () => {
    expect(parse('[1')).toEqual([1]);
  });

  test('comma after element, no next', () => {
    expect(parse('[1, ')).toEqual([1]);
  });

  test('partial string element', () => {
    expect(parse('["hel')).toEqual(['hel']);
  });

  test('mixed elements, partial last', () => {
    expect(parse('[1, "two", tru')).toEqual([1, 'two', true]);
  });

  test('trailing comma', () => {
    expect(parse('[1, 2,]')).toEqual([1, 2]);
  });

  test('nested partial object in array', () => {
    expect(parse('[{"name": "Ali')).toEqual([{ name: 'Ali' }]);
  });
});

describe('partial numbers', () => {
  test('just minus sign', () => {
    expect(parse('-')).toBeUndefined();
  });

  test('trailing dot', () => {
    expect(parse('3.')).toBe(3);
  });

  test('trailing exponent marker', () => {
    expect(parse('1e')).toBe(1);
  });

  test('trailing exponent sign', () => {
    expect(parse('1e+')).toBe(1);
  });

  test('partial exponent digits', () => {
    expect(parse('1e1')).toBe(1e1);
  });
});

describe('partial keywords', () => {
  test('t -> true', () => expect(parse('t')).toBe(true));
  test('tr -> true', () => expect(parse('tr')).toBe(true));
  test('tru -> true', () => expect(parse('tru')).toBe(true));
  test('f -> false', () => expect(parse('f')).toBe(false));
  test('fa -> false', () => expect(parse('fa')).toBe(false));
  test('fal -> false', () => expect(parse('fal')).toBe(false));
  test('fals -> false', () => expect(parse('fals')).toBe(false));
  test('n -> null', () => expect(parse('n')).toBe(null));
  test('nu -> null', () => expect(parse('nu')).toBe(null));
  test('nul -> null', () => expect(parse('nul')).toBe(null));
});

describe('string escapes', () => {
  test('escaped quote', () => {
    expect(parse('"say \\"hi\\""')).toBe('say "hi"');
  });

  test('escaped backslash', () => {
    expect(parse('"a\\\\b"')).toBe('a\\b');
  });

  test('newline escape', () => {
    expect(parse('"line1\\nline2"')).toBe('line1\nline2');
  });

  test('tab escape', () => {
    expect(parse('"col1\\tcol2"')).toBe('col1\tcol2');
  });

  test('unicode escape', () => {
    expect(parse('"caf\\u00e9"')).toBe('café');
  });

  test('partial unicode escape', () => {
    expect(parse('"caf\\u00')).toBe('caf');
  });

  test('backslash at end of input', () => {
    expect(parse('"hello\\')).toBe('hello');
  });

  test('escaped quote in partial string', () => {
    expect(parse('"she said \\"hi')).toBe('she said "hi');
  });
});

describe('deeply nested', () => {
  test('three levels deep, partial leaf', () => {
    expect(parse('{"a": {"b": {"c": "val')).toEqual({ a: { b: { c: 'val' } } });
  });

  test('array of objects, partial last object', () => {
    expect(parse('[{"id": 1}, {"id": 2}, {"id": 3, "name": "thr')).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3, name: 'thr' },
    ]);
  });

  test('object with nested array, partial array element', () => {
    expect(parse('{"users": [{"name": "Alice"}, {"name": "Bo')).toEqual({
      users: [{ name: 'Alice' }, { name: 'Bo' }],
    });
  });
});

describe('llm streaming', () => {
  test('incremental object building', () => {
    const chunks = [
      '{"na',
      'me": "Alice',
      '", "age": 30, "hobbies": ["re',
      'ading", "codi',
      'ng"]}',
    ];

    const parser = createParser();
    const snapshots: unknown[] = [];

    for (const chunk of chunks) {
      parser.push(chunk);
      snapshots.push(structuredClone(parser.value));
    }

    expect(snapshots[0]).toEqual({});
    expect(snapshots[1]).toEqual({ name: 'Alice' });
    expect(snapshots[2]).toEqual({ name: 'Alice', age: 30, hobbies: ['re'] });
    expect(snapshots[3]).toEqual({ name: 'Alice', age: 30, hobbies: ['reading', 'codi'] });
    expect(snapshots[4]).toEqual({ name: 'Alice', age: 30, hobbies: ['reading', 'coding'] });
  });

  test('tool call response', () => {
    const chunks = [
      '{"function": "get_weather", "arg',
      'uments": {"city": "New Yo',
      'rk", "unit": "celsius"}}',
    ];

    const parser = createParser();
    for (const chunk of chunks) parser.push(chunk);

    expect(parser.value).toEqual({
      function: 'get_weather',
      arguments: { city: 'New York', unit: 'celsius' },
    });
  });
});

describe('edge cases', () => {
  test('empty input', () => {
    expect(parse('')).toBeUndefined();
  });

  test('whitespace only', () => {
    expect(parse('   ')).toBeUndefined();
  });

  test('double comma in object', () => {
    expect(parse('{"a": 1,, "b": 2}')).toEqual({ a: 1, b: 2 });
  });

  test('double comma in array', () => {
    expect(parse('[1,, 2]')).toEqual([1, 2]);
  });

  test('booleans and null', () => {
    expect(parse('{"active": true, "deleted": false, "meta": null}')).toEqual({
      active: true,
      deleted: false,
      meta: null,
    });
  });

  test('negative float', () => {
    expect(parse('-3.14')).toBe(-3.14);
  });

  test('scientific notation', () => {
    expect(parse('6.022e23')).toBe(6.022e23);
  });

  test('negative exponent', () => {
    expect(parse('1.5e-3')).toBe(1.5e-3);
  });
});

describe('createParser', () => {
  test('value starts undefined', () => {
    const p = createParser();
    expect(p.value).toBeUndefined();
  });

  test('accumulates chunks', () => {
    const p = createParser();
    p.push('{"a"');
    expect(p.value).toEqual({});
    p.push(': 1}');
    expect(p.value).toEqual({ a: 1 });
  });
});

describe('createStream', () => {
  test('transforms chunks into snapshots', async () => {
    const chunks = ['{"name":', ' "Al', 'ice"}'];
    const stream = new ReadableStream<string>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    });

    const snapshots: unknown[] = [];
    const reader = stream.pipeThrough(createStream()).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      snapshots.push(value);
    }

    expect(snapshots[0]).toEqual({});
    expect(snapshots[1]).toEqual({ name: 'Al' });
    expect(snapshots[2]).toEqual({ name: 'Alice' });
    expect(snapshots.length).toBe(3);
  });
});

describe('parseStream', () => {
  test('async iterable', async () => {
    async function* source() {
      yield '{"x":';
      yield ' 1, "y"';
      yield ': 2}';
    }

    const snapshots: unknown[] = [];
    for await (const snap of parseStream(source())) {
      snapshots.push(snap);
    }

    expect(snapshots[0]).toEqual({});
    expect(snapshots[1]).toEqual({ x: 1 });
    expect(snapshots[2]).toEqual({ x: 1, y: 2 });
  });

  test('ReadableStream', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('[1, ');
        controller.enqueue('2, ');
        controller.enqueue('3]');
        controller.close();
      },
    });

    const snapshots: unknown[] = [];
    for await (const snap of parseStream(stream)) {
      snapshots.push(snap);
    }

    expect(snapshots.at(-1)).toEqual([1, 2, 3]);
  });
});

describe('fuzz', () => {
  const objects = [
    { name: 'Alice', age: 30 },
    [1, 'two', null, true, false],
    { nested: { deep: { value: 'hello\nworld' } }, arr: [1, [2, [3]]] },
    { escapes: 'say "hi"\tand\\or\nnewline', empty: '', zero: 0, neg: -42 },
    { mixed: [null, true, false, 0, -1, 3.14, '', 'abc', { a: 1 }, [2]] },
    { unicode: 'café', path: 'C:\\Users\\admin', slash: 'a/b/c' },
    { flags: { a: { b: { c: { d: true } } } }, tags: [] },
  ];

  for (const obj of objects) {
    const json = JSON.stringify(obj);

    test('split-at-every-position: ' + json.slice(0, 40) + (json.length > 40 ? '...' : ''), () => {
      for (let i = 1; i < json.length; i++) {
        const p = createParser();
        p.push(json.slice(0, i));
        p.push(json.slice(i));
        expect(p.value).toEqual(obj);
      }
    });

    test('char-by-char: ' + json.slice(0, 40) + (json.length > 40 ? '...' : ''), () => {
      const p = createParser();
      for (const ch of json) p.push(ch);
      expect(p.value).toEqual(obj);
    });
  }

  test('partial value never throws', () => {
    const json = JSON.stringify({ a: { b: [1, 'x', null, true] }, c: -3.14 });
    for (let i = 0; i <= json.length; i++) {
      expect(() => parse(json.slice(0, i))).not.toThrow();
    }
  });
});
