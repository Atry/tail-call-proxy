import { parasitic, lazy } from '../src';

describe('index', () => {
  describe('parasitic', () => {
    it('should actually return a number from a number recursive function', () => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      function go(i: number): Number {
        if (i < 1000000) {
          return parasitic(() => go(i + 1));
        } else {
          return new Number(42);
        }
      }
      expect(go(0).valueOf()).toBe(42);
    });

    it('should actually return numbers from nested number recursive functions', () => {
      function fortyTwo(i: number): { x: number } {
        if (i < 1000000) {
          return parasitic(() => fortyTwo(i + 1));
        } else {
          return { x: 42 };
        }
      }
      type List =
        | { value: { x: number }; next: List }
        | { value?: undefined; next?: undefined };
      function list(i: number, accumulator: List): List {
        if (i < 3) {
          return parasitic(() =>
            list(i + 1, { value: fortyTwo(0), next: accumulator })
          );
        } else {
          return accumulator;
        }
      }
      expect(list(0, {})?.value?.x).toBe(42);
    });
  });
  describe('lazy', () => {
    it('should actually return a number from a number recursive function', () => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      function go(i: number): Number {
        if (i < 1000000) {
          return lazy(() => go(i + 1));
        } else {
          return new Number(42);
        }
      }
      expect(go(0).valueOf()).toBe(42);
    });
    it('should not throw a stack overflow error from an asynchronous recursive functions', async () => {
      async function go(i: number): Promise<number> {
        if (i < 3) {
          return lazy(() => go(i + 1));
        } else {
          return 42;
        }
      }
      expect(await go(0)).toBe(42);
    });
    it('should execute aliases of a tail call proxy only once', () => {
      let count = 0;
      const buffer: { x: number }[] = [];
      function fortyTwo(i: number): { x: number } {
        if (i < 3) {
          return lazy(() => fortyTwo(i + 1));
        } else {
          count++;
          return { x: 42 };
        }
      }
      function sideEffect(): { x: number } {
        const result = fortyTwo(0);
        buffer.push(result);
        return result;
      }
      function tailCallSideEffect(): { x: number } {
        return lazy(() => sideEffect());
      }
      type List =
        | { value: { x: number }; next: List }
        | { value?: undefined; next?: undefined };
      function list(i: number, accumulator: List): List {
        if (i < 2) {
          return lazy(() =>
            list(i + 1, { value: tailCallSideEffect(), next: accumulator })
          );
        } else {
          return accumulator;
        }
      }
      expect(list(0, {})).toMatchObject({
        value: { x: 42 },
        next: { value: { x: 42 }, next: {} },
      });
      expect(buffer).toMatchObject([{ x: 42 }, { x: 42 }]);
      expect(count).toBe(2);
    });
  });
});
