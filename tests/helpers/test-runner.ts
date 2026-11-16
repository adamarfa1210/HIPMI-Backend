import path from 'node:path';

export type TestFn = () => void | Promise<void>;
export type HookFn = () => void | Promise<void>;

export interface TestCase {
  name: string;
  fn: TestFn;
  suite: TestSuite;
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: Error;
}

export interface TestSuite {
  name: string;
  filePath?: string;
  tier: string;
  tests: TestCase[];
  beforeAllHooks: HookFn[];
  afterAllHooks: HookFn[];
  beforeEachHooks: HookFn[];
  afterEachHooks: HookFn[];
}

export interface Expectation<T> {
  toBe(expected: T): void;
  toEqual(expected: any): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toBeNull(): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toContain(item: any): void;
  toHaveLength(length: number): void;
  toMatch(regex: RegExp): void;
  toThrow(expectedMessage?: string | RegExp): void;
  rejects: {
    toThrow(expectedMessage?: string | RegExp): Promise<void>;
  };
  not: Omit<Expectation<T>, 'not' | 'rejects'>;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
    return a.equals(b);
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!keysB.includes(k) || !deepEqual(a[k], b[k])) return false;
  }
  return true;
}

export function expect<T = any>(actual: T): Expectation<T> {
  const makeExpectation = (isNot: boolean): any => ({
    toBe(expected: any) {
      const pass = actual === expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be' : 'to be'} ${JSON.stringify(expected)}`);
      }
    },
    toEqual(expected: any) {
      const pass = deepEqual(actual, expected);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to equal' : 'to equal'} ${JSON.stringify(expected)}`);
      }
    },
    toBeTruthy() {
      const pass = Boolean(actual);
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be truthy' : 'to be truthy'}`);
      }
    },
    toBeFalsy() {
      const pass = !actual;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be falsy' : 'to be falsy'}`);
      }
    },
    toBeDefined() {
      const pass = actual !== undefined;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected value ${isNot ? 'to be undefined' : 'to be defined'}`);
      }
    },
    toBeUndefined() {
      const pass = actual === undefined;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be undefined' : 'to be undefined'}`);
      }
    },
    toBeNull() {
      const pass = actual === null;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be null' : 'to be null'}`);
      }
    },
    toBeGreaterThan(expected: number) {
      const pass = (actual as any) > expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? 'not to be greater than' : 'to be greater than'} ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      const pass = (actual as any) >= expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? 'not to be greater than or equal' : 'to be greater than or equal'} ${expected}`);
      }
    },
    toBeLessThan(expected: number) {
      const pass = (actual as any) < expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? 'not to be less than' : 'to be less than'} ${expected}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      const pass = (actual as any) <= expected;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected ${actual} ${isNot ? 'not to be less than or equal' : 'to be less than or equal'} ${expected}`);
      }
    },
    toContain(item: any) {
      let pass = false;
      if (typeof actual === 'string') {
        pass = actual.includes(item);
      } else if (Array.isArray(actual)) {
        pass = actual.some((x) => deepEqual(x, item));
      } else if (actual instanceof Set || actual instanceof Map) {
        pass = actual.has(item);
      }
      if (isNot ? pass : !pass) {
        throw new Error(`Expected collection ${isNot ? 'not to contain' : 'to contain'} ${JSON.stringify(item)}`);
      }
    },
    toHaveLength(length: number) {
      const len = (actual as any)?.length;
      const pass = len === length;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected length ${isNot ? 'not to be' : 'to be'} ${length}, but got ${len}`);
      }
    },
    toMatch(regex: RegExp) {
      const pass = regex.test(String(actual));
      if (isNot ? pass : !pass) {
        throw new Error(`Expected "${actual}" ${isNot ? 'not to match' : 'to match'} ${regex}`);
      }
    },
    toThrow(expectedMessage?: string | RegExp) {
      if (typeof actual !== 'function') {
        throw new Error('expect(fn).toThrow() requires a function');
      }
      let thrown: any = null;
      try {
        (actual as any)();
      } catch (err) {
        thrown = err;
      }
      const pass = thrown !== null;
      if (isNot ? pass : !pass) {
        throw new Error(`Expected function ${isNot ? 'not to throw' : 'to throw an error'}`);
      }
      if (pass && expectedMessage) {
        const msg = thrown?.message || String(thrown);
        if (typeof expectedMessage === 'string' && !msg.includes(expectedMessage)) {
          throw new Error(`Expected error message to include "${expectedMessage}", but got "${msg}"`);
        } else if (expectedMessage instanceof RegExp && !expectedMessage.test(msg)) {
          throw new Error(`Expected error message to match ${expectedMessage}, but got "${msg}"`);
        }
      }
    },
  });

  const normal = makeExpectation(false);
  normal.not = makeExpectation(true);
  normal.rejects = {
    async toThrow(expectedMessage?: string | RegExp) {
      if (!(actual instanceof Promise) && typeof (actual as any)?.then !== 'function') {
        throw new Error('expect(promise).rejects requires a Promise');
      }
      let rejected: any = null;
      try {
        await actual;
      } catch (err) {
        rejected = err;
      }
      if (!rejected) {
        throw new Error('Expected promise to reject, but it resolved successfully');
      }
      if (expectedMessage) {
        const msg = rejected?.message || String(rejected);
        if (typeof expectedMessage === 'string' && !msg.includes(expectedMessage)) {
          throw new Error(`Expected promise rejection to include "${expectedMessage}", but got "${msg}"`);
        } else if (expectedMessage instanceof RegExp && !expectedMessage.test(msg)) {
          throw new Error(`Expected promise rejection to match ${expectedMessage}, but got "${msg}"`);
        }
      }
    },
  };

  return normal;
}

// Global Runner Registry
export class TestRunnerContext {
  public suites: TestSuite[] = [];
  public currentSuite: TestSuite | null = null;
  public currentTier: string = 'Harness';

  public registerSuite(name: string, fn: () => void, tier?: string): TestSuite {
    const suite: TestSuite = {
      name,
      tier: tier || this.currentTier,
      tests: [],
      beforeAllHooks: [],
      afterAllHooks: [],
      beforeEachHooks: [],
      afterEachHooks: [],
    };
    this.suites.push(suite);

    const prev = this.currentSuite;
    this.currentSuite = suite;
    try {
      fn();
    } finally {
      this.currentSuite = prev;
    }
    return suite;
  }

  public registerTest(name: string, fn: TestFn): void {
    if (!this.currentSuite) {
      this.registerSuite('Default Suite', () => {
        this.currentSuite!.tests.push({
          name,
          fn,
          suite: this.currentSuite!,
          status: 'pending',
          durationMs: 0,
        });
      });
      return;
    }
    this.currentSuite.tests.push({
      name,
      fn,
      suite: this.currentSuite,
      status: 'pending',
      durationMs: 0,
    });
  }

  public clear(): void {
    this.suites = [];
    this.currentSuite = null;
  }
}

export const runnerContext = new TestRunnerContext();

// Detect if running under Vitest / Jest
const hasVitest = typeof (globalThis as any).__vitest_index__ !== 'undefined' ||
  (typeof process !== 'undefined' && (process.env.VITEST === 'true' || process.env.npm_lifecycle_script?.includes('vitest')));

const nativeDescribe = (globalThis as any).describe;
const nativeIt = (globalThis as any).it;
const nativeTest = (globalThis as any).test;
const nativeExpect = (globalThis as any).expect;
const nativeBeforeAll = (globalThis as any).beforeAll;
const nativeAfterAll = (globalThis as any).afterAll;
const nativeBeforeEach = (globalThis as any).beforeEach;
const nativeAfterEach = (globalThis as any).afterEach;

export function describe(name: string, fn: () => void): any {
  if (hasVitest && typeof nativeDescribe === 'function') {
    return nativeDescribe(name, fn);
  }
  return runnerContext.registerSuite(name, fn);
}

export function it(name: string, fn: TestFn): any {
  if (hasVitest && typeof nativeIt === 'function') {
    return nativeIt(name, fn);
  }
  runnerContext.registerTest(name, fn);
}

export const test = it;

export function beforeAll(fn: HookFn): void {
  if (hasVitest && typeof nativeBeforeAll === 'function') {
    return nativeBeforeAll(fn);
  }
  if (runnerContext.currentSuite) {
    runnerContext.currentSuite.beforeAllHooks.push(fn);
  }
}

export function afterAll(fn: HookFn): void {
  if (hasVitest && typeof nativeAfterAll === 'function') {
    return nativeAfterAll(fn);
  }
  if (runnerContext.currentSuite) {
    runnerContext.currentSuite.afterAllHooks.push(fn);
  }
}

export function beforeEach(fn: HookFn): void {
  if (hasVitest && typeof nativeBeforeEach === 'function') {
    return nativeBeforeEach(fn);
  }
  if (runnerContext.currentSuite) {
    runnerContext.currentSuite.beforeEachHooks.push(fn);
  }
}

export function afterEach(fn: HookFn): void {
  if (hasVitest && typeof nativeAfterEach === 'function') {
    return nativeAfterEach(fn);
  }
  if (runnerContext.currentSuite) {
    runnerContext.currentSuite.afterEachHooks.push(fn);
  }
}

const customExpect = expect;
export { customExpect };

// Attach to globalThis if not already set by Vitest
if (!hasVitest) {
  (globalThis as any).describe = describe;
  (globalThis as any).it = it;
  (globalThis as any).test = test;
  (globalThis as any).expect = expect;
  (globalThis as any).beforeAll = beforeAll;
  (globalThis as any).afterAll = afterAll;
  (globalThis as any).beforeEach = beforeEach;
  (globalThis as any).afterEach = afterEach;
}
