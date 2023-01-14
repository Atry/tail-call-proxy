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

const TARGET = Symbol();

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
      const nonNullProxyOrResult: { [TARGET]?: ProxyTarget<T> } = proxyOrResult;
      const { [TARGET]: tail } = nonNullProxyOrResult;
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

const LAZY_PROXY_HANDLER: ProxyHandler<ProxyTarget<object>> =
  Object.fromEntries(
    Object.entries(Object.getOwnPropertyDescriptors(Reflect)).map(
      ([functionName, { value }]) => {
        switch (functionName) {
          case 'get':
            return [
              functionName,
              (
                target: ProxyTarget<object>,
                propertyKey: string | symbol,
                receiver: unknown
              ) => {
                switch (propertyKey) {
                  case TARGET:
                    return target;
                  default: {
                    const result = getResult(target);
                    const property: unknown = Reflect.get(
                      result,
                      propertyKey,
                      receiver
                    );
                    if (typeof property === 'function') {
                      return function (this: any, ...argArray: any[]): unknown {
                        return Reflect.apply(
                          property,
                          this === receiver ? result : this,
                          argArray
                        );
                      };
                    } else {
                      return property;
                    }
                  }
                }
              },
            ];
          default:
            return [
              functionName,
              (target: ProxyTarget<object>, ...args: any) =>
                (value as (target: any, ...args: any) => unknown)(
                  getResult(target),
                  ...args
                ),
            ];
        }
      }
    )
  );

/**
 * Returns an proxy object whose underlying object will be lazily created
 * at the first time its properties or methods are used.
 *
 * `lazy` can eliminate tail calls, preventing stack overflow errors for in
 * tail recursive functions or mutual recursive functions.
 *
 * @param tailCall the function to create the underlying object
 *
 * @example
 *
 * The `initializer` should not be called until the first to access
 * `lazyObject.hello`. When `lazyObject.hello` is accessed more than once,
 * the second access would not trigger the `initializer`.
 *
 * ``` typescript doctest
 * import { lazy } from 'tail-call-proxy';
 *
 * const initializer = jest.fn(() => ({ hello: 'world' }))
 * const lazyObject = lazy(initializer);
 * expect(initializer).not.toHaveBeenCalled()
 *
 * expect(lazyObject.hello).toBe('world');
 * expect(initializer).toHaveBeenCalledTimes(1);
 *
 * expect(lazyObject.hello).toBe('world');
 * expect(initializer).toHaveBeenCalledTimes(1);
 * ```
 *
 * @example
 *
 * The following mutual recursive functions would result in stack overflow:
 *
 * ``` typescript doctest
 * import { lazy } from 'tail-call-proxy';
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
 * expect(isOdd(1000000).valueOf()).toBe(false)
 * ```
 *
 * However, if you replace `return xxx` with `return lazy(() => xxx)`, it will
 * use a constant size of stack memory and avoid the stack overflow.
 *
 * ``` typescript doctest
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
 * expect(isOdd(1000000).valueOf()).toBe(false)
 * ```
 */
export function lazy<T extends object>(tailCall: () => T): T {
  return new Proxy({ tailCall }, LAZY_PROXY_HANDLER) as T;
}

/**
 * Returns either an proxy object whose underlying object will be created in
 * a queue, or just the underlying object if the queue is empty.
 *
 * @param tailCall the function to create the underlying object
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
