import { createTestToken, RoleType, AuthUser } from './auth-helper.js';

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  role?: RoleType | Partial<AuthUser>;
  token?: string;
}

export interface UploadFile {
  fieldName: string;
  filename: string;
  buffer: Buffer;
  contentType?: string;
}

export interface UploadOptions extends RequestOptions {
  fields?: Record<string, string | number | boolean>;
  files: UploadFile[];
}

export interface HonoAppLike {
  request(
    input: any,
    requestInit?: RequestInit
  ): Promise<Response> | Response;
}

export class TestResponse {
  public readonly status: number;
  public readonly statusText: string;
  public readonly headers: Headers;
  public readonly rawResponse: Response;
  private cachedBodyText?: string;
  private cachedJson?: any;

  constructor(res: Response) {
    this.rawResponse = res;
    this.status = res.status;
    this.statusText = res.statusText;
    this.headers = res.headers;
  }

  public async text(): Promise<string> {
    if (this.cachedBodyText === undefined) {
      this.cachedBodyText = await this.rawResponse.text();
    }
    return this.cachedBodyText;
  }

  public async json<T = any>(): Promise<T> {
    if (this.cachedJson === undefined) {
      const txt = await this.text();
      try {
        this.cachedJson = JSON.parse(txt);
      } catch (err: any) {
        throw new Error(
          `Failed to parse response body as JSON (HTTP ${this.status}). Body was: "${txt.slice(0, 200)}"`
        );
      }
    }
    return this.cachedJson as T;
  }

  public async buffer(): Promise<Buffer> {
    const ab = await this.rawResponse.arrayBuffer();
    return Buffer.from(ab);
  }

  // --- Assertion Helpers ---

  public expectStatus(expected: number): this {
    if (this.status !== expected) {
      throw new Error(
        `Assertion failed: Expected HTTP status ${expected}, but got ${this.status} (${this.statusText})`
      );
    }
    return this;
  }

  public expectOk(): this {
    if (this.status < 200 || this.status >= 300) {
      throw new Error(
        `Assertion failed: Expected successful 2xx status, but got ${this.status} (${this.statusText})`
      );
    }
    return this;
  }

  public expectCreated(): this {
    return this.expectStatus(201);
  }

  public expectBadRequest(): this {
    return this.expectStatus(400);
  }

  public expectUnauthorized(): this {
    return this.expectStatus(401);
  }

  public expectForbidden(): this {
    return this.expectStatus(403);
  }

  public expectNotFound(): this {
    return this.expectStatus(404);
  }

  public expectUnprocessable(): this {
    return this.expectStatus(422);
  }

  public async expectSuccess(expectedSuccess: boolean = true): Promise<this> {
    const data = await this.json();
    if (data.success !== expectedSuccess) {
      throw new Error(
        `Assertion failed: Expected response.success to be ${expectedSuccess}, but got ${data.success}. Payload: ${JSON.stringify(data)}`
      );
    }
    return this;
  }

  public async expectJsonMatch(subset: Record<string, any>): Promise<this> {
    const data = await this.json();
    for (const [key, expectedVal] of Object.entries(subset)) {
      if (data[key] !== expectedVal) {
        throw new Error(
          `Assertion failed: Expected field "${key}" to equal ${JSON.stringify(expectedVal)}, but got ${JSON.stringify(data[key])}`
        );
      }
    }
    return this;
  }
}

export class AppClient {
  private app?: HonoAppLike;
  private baseUrl?: string;
  private defaultHeaders: Record<string, string>;
  private authToken?: string;

  constructor(config?: {
    app?: HonoAppLike;
    baseUrl?: string;
    defaultHeaders?: Record<string, string>;
    token?: string;
  }) {
    this.app = config?.app;
    this.baseUrl = config?.baseUrl || process.env.TEST_BASE_URL || process.env.API_URL;
    this.defaultHeaders = config?.defaultHeaders || {};
    this.authToken = config?.token;
  }

  /**
   * Lazily resolves the Hono application from src/index.ts if neither app nor baseUrl is provided.
   */
  public async resolveApp(): Promise<HonoAppLike | undefined> {
    if (this.app) return this.app;
    if (this.baseUrl) return undefined;

    try {
      // Dynamic import of src/index.js
      const module = await import('../../src/index.js');
      if (module.default && typeof module.default.request === 'function') {
        this.app = module.default;
      } else if (module.app && typeof module.app.request === 'function') {
        this.app = module.app;
      }
    } catch {
      // Not yet built or available
    }
    return this.app;
  }

  public as(roleOrUser: RoleType | Partial<AuthUser>): AppClient {
    const token = createTestToken(roleOrUser);
    return new AppClient({
      app: this.app,
      baseUrl: this.baseUrl,
      defaultHeaders: { ...this.defaultHeaders },
      token,
    });
  }

  public withToken(token: string): AppClient {
    return new AppClient({
      app: this.app,
      baseUrl: this.baseUrl,
      defaultHeaders: { ...this.defaultHeaders },
      token,
    });
  }

  public withoutAuth(): AppClient {
    const client = new AppClient({
      app: this.app,
      baseUrl: this.baseUrl,
      defaultHeaders: { ...this.defaultHeaders },
    });
    client.authToken = undefined;
    return client;
  }

  private buildUrl(path: string, query?: Record<string, any>): string {
    let cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) {
          params.append(k, String(v));
        }
      }
      const qs = params.toString();
      if (qs) {
        cleanPath += (cleanPath.includes('?') ? '&' : '?') + qs;
      }
    }
    return cleanPath;
  }

  public async request(
    method: string,
    path: string,
    body?: any,
    options?: RequestOptions
  ): Promise<TestResponse> {
    const targetPath = this.buildUrl(path, options?.query);
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...(options?.headers || {}),
    };

    const token = options?.token || (options?.role ? createTestToken(options.role) : this.authToken);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let requestBody: any = undefined;
    if (body !== undefined && body !== null) {
      if (typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !Buffer.isBuffer(body)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        requestBody = JSON.stringify(body);
      } else {
        requestBody = body;
      }
    }

    const app = await this.resolveApp();

    if (app) {
      // Hono in-memory request execution
      const fullUrl = `http://localhost${targetPath}`;
      const req = new Request(fullUrl, {
        method,
        headers,
        body: requestBody,
      });
      const res = await app.request(req);
      return new TestResponse(res);
    } else {
      // Running server request via global fetch
      const host = this.baseUrl || 'http://localhost:3000';
      const fullUrl = `${host.replace(/\/$/, '')}${targetPath}`;
      const res = await fetch(fullUrl, {
        method,
        headers,
        body: requestBody,
      });
      return new TestResponse(res);
    }
  }

  public async get(path: string, options?: RequestOptions): Promise<TestResponse> {
    return this.request('GET', path, undefined, options);
  }

  public async post(path: string, body?: any, options?: RequestOptions): Promise<TestResponse> {
    return this.request('POST', path, body, options);
  }

  public async put(path: string, body?: any, options?: RequestOptions): Promise<TestResponse> {
    return this.request('PUT', path, body, options);
  }

  public async patch(path: string, body?: any, options?: RequestOptions): Promise<TestResponse> {
    return this.request('PATCH', path, body, options);
  }

  public async delete(path: string, options?: RequestOptions): Promise<TestResponse> {
    return this.request('DELETE', path, undefined, options);
  }

  /**
   * Uploads multipart/form-data payload with support for fields and binary files.
   */
  public async upload(path: string, options: UploadOptions): Promise<TestResponse> {
    const formData = new FormData();

    if (options.fields) {
      for (const [k, v] of Object.entries(options.fields)) {
        formData.append(k, String(v));
      }
    }

    for (const f of options.files) {
      const blob = new Blob([new Uint8Array(f.buffer)], { type: f.contentType || 'application/octet-stream' });
      formData.append(f.fieldName, blob, f.filename);
    }

    const headers = { ...(options.headers || {}) };
    // Remove manual content-type to let fetch/Request set the boundary
    delete headers['Content-Type'];
    delete headers['content-type'];

    return this.request('POST', path, formData, {
      ...options,
      headers,
    });
  }
}

export const createTestClient = (config?: { app?: HonoAppLike; baseUrl?: string }): AppClient => {
  return new AppClient(config);
};
