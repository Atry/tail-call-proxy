/* eslint-disable @typescript-eslint/ban-types */
type ProxyTarget<T extends object> = {
  tailCall?: () => T;
  tail?: ProxyTarget<T>;
  result?: T;
  error?: any;
};

function getResult<T extends object>(target: ProxyTarget<T>): T {
  if ('result' in target) {
    return target['result'] as T;
  } else if ('error' in target) {
    throw target['error'];
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
                      return function (this: any, ...argArray: any[]): any {
                        Reflect.apply(
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

export function lazy<T extends object>(tailCall: () => T): T {
  return new Proxy({ tailCall }, LAZY_PROXY_HANDLER) as T;
}

export function parasitic<T extends object>(tailCall: () => T): T {
  const target: ProxyTarget<T> = { tailCall };
  if (isRunning) {
    parasiticQueue.push(target);
    return new Proxy(target, LAZY_PROXY_HANDLER) as T;
  } else {
    return getResult(target);
  }
}
