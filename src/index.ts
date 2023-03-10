/* eslint-disable @typescript-eslint/ban-types */

/**
 * Delayed initialized objects that support tail-call optimization.
 *
 * [![npm package][npm-img]][npm-url]
 * [![Build Status][build-img]][build-url]
 * [![Downloads][downloads-img]][downloads-url]
 * [![Issues][issues-img]][issues-url]
 * [![Code Coverage][codecov-img]][codecov-url]
 * [![Commitizen Friendly][commitizen-img]][commitizen-url]
 * [![Semantic Release][semantic-release-img]][semantic-release-url]
 *
 * [build-img]:https://github.com/Atry/tail-call-proxy/actions/workflows/release.yml/badge.svg
 * [build-url]:https://github.com/Atry/tail-call-proxy/actions/workflows/release.yml
 * [downloads-img]:https://img.shields.io/npm/dt/tail-call-proxy
 * [downloads-url]:https://www.npmtrends.com/tail-call-proxy
 * [npm-img]:https://img.shields.io/npm/v/tail-call-proxy
 * [npm-url]:https://www.npmjs.com/package/tail-call-proxy
 * [issues-img]:https://img.shields.io/github/issues/Atry/tail-call-proxy
 * [issues-url]:https://github.com/Atry/tail-call-proxy/issues
 * [codecov-img]:https://codecov.io/gh/Atry/tail-call-proxy/branch/main/graph/badge.svg
 * [codecov-url]:https://codecov.io/gh/Atry/tail-call-proxy
 * [semantic-release-img]:https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg
 * [semantic-release-url]:https://github.com/semantic-release/semantic-release
 * [commitizen-img]:https://img.shields.io/badge/commitizen-friendly-brightgreen.svg
 * [commitizen-url]:http://commitizen.github.io/cz-cli/
 *
 * @module
 */

import {
  getTarget,
  AllowGetTarget,
  Mapped,
  DefaultToPrimitive,
  DefaultToStringTag,
  TargetAsThis,
} from 'proxy-handler-decorators';
import { DefaultProxyHandler } from 'default-proxy-handler';

type ProxyTarget<T extends object> = {
  tailCall?: () => T;
  tail?: ProxyTarget<T>;
  result?: T;
  error?: any;
};

function getResult<T extends object>(target: ProxyTarget<T>): T {
  if ('result' in target) {
    return target.result as T;
  } else if ('error' in target) {
    throw target.error;
  } else {
    run(target);
    return getResult(target);
  }
}

@AllowGetTarget
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
@Mapped(getResult)
@DefaultToPrimitive
@DefaultToStringTag
@TargetAsThis
class TailCallProxyHandler<T extends object> extends DefaultProxyHandler<
  T | ProxyTarget<T>
> {}

let parasiticQueue: ProxyTarget<any>[] = [];

let isRunning = false;

function step<T extends object>(target: ProxyTarget<T>): void {
  const { tailCall } = target;
  let proxyOrResult: T;
  if (tailCall !== undefined) {
    try {
      try {
        proxyOrResult = tailCall();
      } finally {
        delete target.tailCall;
      }
    } catch (error) {
      target.error = error;
      return;
    }
    if (proxyOrResult == null) {
      target.result = proxyOrResult;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const tail: ProxyTarget<T> | undefined = getTarget(proxyOrResult);
      if (tail === undefined) {
        target.result = proxyOrResult;
      } else {
        target.tail = tail;
      }
    }
  }
}

function resolveWith<T extends object>(
  headTarget: ProxyTarget<T>,
  lastTarget: ProxyTarget<T>
): void {
  if ('error' in lastTarget) {
    headTarget.error = lastTarget.error;
  } else {
    headTarget.result = lastTarget.result;
  }
}

function resolve<T extends object>(headTarget: ProxyTarget<T>): void {
  step(headTarget);
  if (headTarget.tail !== undefined) {
    let target = headTarget.tail;
    delete headTarget.tail;
    for (;;) {
      step(target);
      const { tail } = target;
      const queue = parasiticQueue;
      if (queue.length !== 0) {
        parasiticQueue = [];
        for (const parasiticTarget of queue) {
          if (parasiticTarget !== tail) {
            resolve(parasiticTarget);
          }
        }
      }
      if (tail !== undefined) {
        target = tail;
      } else {
        resolveWith(headTarget, target);
        return;
      }
    }
  }
}

function run<T extends object>(target: ProxyTarget<T>): void {
  if (isRunning) {
    resolve(target);
  }
  isRunning = true;
  try {
    resolve(target);
  } finally {
    isRunning = false;
  }
}

const LAZY_PROXY_HANDLER = new TailCallProxyHandler();
/**
 * Returns an proxy object backed by `tailCall`, which will be lazily created
 * at the first time its properties or methods are used.
 *
 * `lazy` can eliminate tail calls, preventing stack overflow errors in tail
 * recursive functions or mutual recursive functions.
 *
 * @param tailCall the function to create the underlying object
 *
 * @example
 *
 * The initializer passed to `lazy` should not be called until the first time
 * `lazyObject.hello` is accessed. When `lazyObject.hello` is accessed more than
 * once, the second access would not trigger the initializer again.
 *
 * ```typescript doctest
 * import { lazy } from 'tail-call-proxy';
 *
 * let counter = 0;
 * const lazyObject = lazy(() => {
 *   counter++;
 *   return { hello: 'world' };
 * });
 * expect(counter).toBe(0);
 *
 * expect(lazyObject.hello).toBe('world');
 * expect(counter).toBe(1);
 *
 * expect(lazyObject.hello).toBe('world');
 * expect(counter).toBe(1);
 * ```
 *
 * @example
 *
 * Note that errors thrown in the initializer will be delayed as well.
 *
 * ```typescript doctest
 * import { lazy } from 'tail-call-proxy';
 *
 * let counter = 0;
 * const lazyError: Record<string, unknown> = lazy(() => {
 *   counter++;
 *   throw new Error();
 * });
 *
 * // No error is thrown, given that the underlying object have not been created
 * // yet.
 * expect(counter).toBe(0);
 *
 * expect(() => lazyError.toString()).toThrow();
 * expect(counter).toBe(1);
 *
 * expect(() => lazyError.toLocaleString()).toThrow();
 * expect(counter).toBe(1);
 * ```
 *
 * @example
 *
 * The following mutual recursive functions would result in stack overflow:
 *
 * ```typescript doctest
 * function isEven(n: number): Boolean {
 *   if (n === 0) {
 *     return new Boolean(true);
 *   }
 *   return isOdd(n - 1);
 * }
 *
 * function isOdd(n: number): Boolean {
 *   if (n === 0) {
 *     return new Boolean(false);
 *   }
 *   return isEven(n - 1);
 * }
 *
 * expect(() => isOdd(1000000)).toThrow();
 * ```
 *
 * However, if you replace `return xxx` with `return lazy(() => xxx)`, it will
 * use a constant size of stack memory and avoid the stack overflow.
 *
 * ```typescript doctest
 * import { lazy } from 'tail-call-proxy';
 * function isEven(n: number): Boolean {
 *   if (n === 0) {
 *     return new Boolean(true);
 *   }
 *   return lazy(() => isOdd(n - 1));
 * }
 *
 * function isOdd(n: number): Boolean {
 *   if (n === 0) {
 *     return new Boolean(false);
 *   }
 *   return lazy(() => isEven(n - 1));
 * }
 *
 * expect(isOdd(1000000).valueOf()).toBe(false);
 * ```
 */
export function lazy<T extends object>(tailCall: () => T): T {
  return new Proxy({ tailCall }, LAZY_PROXY_HANDLER) as T;
}

/**
 * Performs a tail call as soon as possible.
 *
 * `parasitic` returns either exactly the object returned by `tailCall`, or a
 * proxy object backed by the object returned by `tailCall`, if there are any
 * previously started pending tail calls. In the latter case, the underlying
 * object will be created after all the previous tail calls are finished.
 *
 * @param tailCall the function to create the underlying object
 *
 * @example
 *
 * Unlike {@link lazy}, `parasitic` performs the initialization as soon as
 * possible:
 *
 * ```typescript doctest
 * import { parasitic } from 'tail-call-proxy';
 *
 * let counter = 0;
 * const parasiticObject = parasitic(() => {
 *   counter++;
 *   return { hello: 'world' };
 * });
 * expect(counter).toBe(1);
 *
 * expect(parasiticObject.hello).toBe('world');
 * expect(counter).toBe(1);
 *
 * expect(parasiticObject.hello).toBe('world');
 * expect(counter).toBe(1);
 * ```
 *
 * @example
 *
 * `parasitic` is useful when you need tail call optimization while you don't
 * need the lazy evaluation. It can be used together with {@link lazy}
 * alternately.
 *
 * ```typescript doctest
 * import { lazy, parasitic } from 'tail-call-proxy';
 *
 * let isEvenCounter = 0;
 * const trueObject = new Boolean(true);
 * function isEven(n: number): Boolean {
 *   isEvenCounter++;
 *   if (n === 0) {
 *     return trueObject;
 *   }
 *   return lazy(() => isOdd(n - 1));
 * };
 *
 * let isOddCounter = 0;
 * const falseObject = new Boolean(false);
 * function isOdd(n: number): Boolean {
 *   isOddCounter++;
 *   if (n === 0) {
 *     return falseObject;
 *   }
 *   return parasitic(() => isEven(n - 1));
 * };
 *
 * try {
 *   // `isEven` is called, but `lazy(() => isOdd(n - 1))` does not trigger
 *   // `isOdd` immediately.
 *   const is1000000Even = isEven(1000000);
 *   expect(isOddCounter).toBe(0);
 *   expect(isEvenCounter).toBe(1);
 *
 *   // `valueOf` triggers the rest of the recursion.
 *   expect(is1000000Even.valueOf()).toBe(true);
 *   expect(isOddCounter).toBe(500000);
 *   expect(isEvenCounter).toBe(500001);
 *
 *   // `is1000000Even` is a lazy proxy backed by `trueObject`, not the exactly
 *   // same object of `trueObject`.
 *   expect(is1000000Even).not.toStrictEqual(trueObject);
 *   expect(is1000000Even).toEqual(trueObject);
 * } finally {
 *   isEvenCounter = 0;
 *   isOddCounter = 0;
 * }
 *
 * // `isOdd` is called, in which `parasitic(() => isEven(n - 1))` triggers the
 * // rest of the recursion immediately.
 * const is1000000Odd = isOdd(1000000);
 * expect(isOddCounter).toBe(500001);
 * expect(isEvenCounter).toBe(500000);
 * expect(is1000000Odd.valueOf()).toBe(false);
 * expect(isOddCounter).toBe(500001);
 * expect(isEvenCounter).toBe(500000);
 *
 * // `is1000000Odd` is exactly the same object of `falseObject`, not a lazy
 * // proxy.
 * expect(is1000000Odd).toStrictEqual(falseObject);
 * ```
 */
export function parasitic<T extends object>(tailCall: () => T): T {
  const target: ProxyTarget<T> = { tailCall };
  if (isRunning) {
    parasiticQueue.push(target);
    return new Proxy(target, LAZY_PROXY_HANDLER) as T;
  } else {
    return getResult(target);
  }
}
