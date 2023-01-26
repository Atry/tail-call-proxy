<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [tail-call-proxy](#tail-call-proxy)
  - [Functions](#functions)
    - [lazy](#lazy)
    - [parasitic](#parasitic)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->


<a name="readmemd"></a>

# tail-call-proxy

Delayed initialized objects that support tail-call optimization.

[![npm package][npm-img]][npm-url]
[![Build Status][build-img]][build-url]
[![Downloads][downloads-img]][downloads-url]
[![Issues][issues-img]][issues-url]
[![Code Coverage][codecov-img]][codecov-url]
[![Commitizen Friendly][commitizen-img]][commitizen-url]
[![Semantic Release][semantic-release-img]][semantic-release-url]

[build-img]:https://github.com/Atry/tail-call-proxy/actions/workflows/release.yml/badge.svg
[build-url]:https://github.com/Atry/tail-call-proxy/actions/workflows/release.yml
[downloads-img]:https://img.shields.io/npm/dt/tail-call-proxy
[downloads-url]:https://www.npmtrends.com/tail-call-proxy
[npm-img]:https://img.shields.io/npm/v/tail-call-proxy
[npm-url]:https://www.npmjs.com/package/tail-call-proxy
[issues-img]:https://img.shields.io/github/issues/Atry/tail-call-proxy
[issues-url]:https://github.com/Atry/tail-call-proxy/issues
[codecov-img]:https://codecov.io/gh/Atry/tail-call-proxy/branch/main/graph/badge.svg
[codecov-url]:https://codecov.io/gh/Atry/tail-call-proxy
[semantic-release-img]:https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg
[semantic-release-url]:https://github.com/semantic-release/semantic-release
[commitizen-img]:https://img.shields.io/badge/commitizen-friendly-brightgreen.svg
[commitizen-url]:http://commitizen.github.io/cz-cli/

## Functions

### lazy

▸ **lazy**<`T`\>(`tailCall`): `T`

Returns an proxy object backed by `tailCall`, which will be lazily created
at the first time its properties or methods are used.

`lazy` can eliminate tail calls, preventing stack overflow errors in tail
recursive functions or mutual recursive functions.

**`Example`**

The initializer passed to `lazy` should not be called until the first time
`lazyObject.hello` is accessed. When `lazyObject.hello` is accessed more than
once, the second access would not trigger the initializer again.

```typescript doctest
import { lazy } from 'tail-call-proxy';

let counter = 0;
const lazyObject = lazy(() => {
  counter++;
  return { hello: 'world' };
});
expect(counter).toBe(0);

expect(lazyObject.hello).toBe('world');
expect(counter).toBe(1);

expect(lazyObject.hello).toBe('world');
expect(counter).toBe(1);
```

**`Example`**

Note that errors thrown in the initializer will be delayed as well.

```typescript doctest
import { lazy } from 'tail-call-proxy';

let counter = 0;
const lazyError: Record<string, unknown> = lazy(() => {
  counter++;
  throw new Error();
});

// No error is thrown, given that the underlying object have not been created
// yet.
expect(counter).toBe(0);

expect(() => lazyError.toString()).toThrow();
expect(counter).toBe(1);

expect(() => lazyError.toLocaleString()).toThrow();
expect(counter).toBe(1);
```

**`Example`**

The following mutual recursive functions would result in stack overflow:

```typescript doctest
import { lazy } from 'tail-call-proxy';
function isEven(n: number): Boolean {
  if (n === 0) {
    return new Boolean(true);
  }
  return isOdd(n - 1);
}

function isOdd(n: number): Boolean {
  if (n === 0) {
    return new Boolean(false);
  }
  return isEven(n - 1);
}

expect(() => isOdd(1000000)).toThrow();
```

However, if you replace `return xxx` with `return lazy(() => xxx)`, it will
use a constant size of stack memory and avoid the stack overflow.

```typescript doctest
import { lazy } from 'tail-call-proxy';
function isEven(n: number): Boolean {
  if (n === 0) {
    return new Boolean(true);
  }
  return lazy(() => isOdd(n - 1));
}

function isOdd(n: number): Boolean {
  if (n === 0) {
    return new Boolean(false);
  }
  return lazy(() => isEven(n - 1));
}

expect(isOdd(1000000).valueOf()).toBe(false);
```

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends `object` |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `tailCall` | () => `T` | the function to create the underlying object |

#### Returns

`T`

#### Defined in

[index.ts:254](https://github.com/Atry/tail-call-proxy/blob/f08f7b0/src/index.ts#L254)

___

### parasitic

▸ **parasitic**<`T`\>(`tailCall`): `T`

Performs a tail call as soon as possible.

`parasitic` returns either exactly the object returned by `tailCall`, or a
proxy object backed by the object returned by `tailCall`, if there are any
previously started pending tail calls. In the latter case, the underlying
object will be created after all the previous tail calls are finished.

**`Example`**

Unlike [lazy](#lazy), `parasitic` performs the initialization as soon as
possible:

```typescript doctest
import { parasitic } from 'tail-call-proxy';

let counter = 0;
const parasiticObject = parasitic(() => {
  counter++;
  return { hello: 'world' };
});
expect(counter).toBe(1);

expect(parasiticObject.hello).toBe('world');
expect(counter).toBe(1);

expect(parasiticObject.hello).toBe('world');
expect(counter).toBe(1);
```

**`Example`**

`parasitic` is useful when you need tail call optimization while you don't
need the lazy evaluation. It can be used together with [lazy](#lazy)
alternately.

```typescript doctest
import { lazy, parasitic } from 'tail-call-proxy';

let isEvenCounter = 0;
const trueObject = new Boolean(true);
const falseObject = new Boolean(false);
function isEven(n: number): Boolean {
  isEvenCounter++;
  if (n === 0) {
    return trueObject;
  }
  return lazy(() => isOdd(n - 1));
};

let isOddCounter = 0;
function isOdd(n: number): Boolean {
  isOddCounter++;
  if (n === 0) {
    return falseObject;
  }
  return parasitic(() => isEven(n - 1));
};

try {
  // `isEven` is called, but `lazy(() => isOdd(n - 1))` does not trigger
  // `isOdd` immediately.
  const is1000000Even = isEven(1000000);
  expect(isOddCounter).toBe(0);
  expect(isEvenCounter).toBe(1);

  // `valueOf` triggers the rest of the recursion.
  expect(is1000000Even.valueOf()).toBe(true);
  expect(isOddCounter).toBe(500000);
  expect(isEvenCounter).toBe(500001);

  // `is1000000Even` is a lazy proxy backed by `trueObject`, not the exactly
  // same object of `trueObject`.
  expect(is1000000Even).not.toStrictEqual(trueObject);
  expect(is1000000Even).toEqual(trueObject);
} finally {
  isEvenCounter = 0;
  isOddCounter = 0;
}

// `isOdd` is called, in which `parasitic(() => isEven(n - 1))` triggers the
// rest of the recursion immediately.
const is1000000Odd = isOdd(1000000);
expect(isOddCounter).toBe(500001);
expect(isEvenCounter).toBe(500000);
expect(is1000000Odd.valueOf()).toBe(false);
expect(isOddCounter).toBe(500001);
expect(isEvenCounter).toBe(500000);

// `is1000000Odd` is exactly the same object of `falseObject`, not a lazy
// proxy.
expect(is1000000Odd).toStrictEqual(falseObject);
```

#### Type parameters

| Name | Type |
| :------ | :------ |
| `T` | extends `object` |

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `tailCall` | () => `T` | the function to create the underlying object |

#### Returns

`T`

#### Defined in

[index.ts:354](https://github.com/Atry/tail-call-proxy/blob/f08f7b0/src/index.ts#L354)
