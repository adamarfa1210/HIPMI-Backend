import http from 'node:http';

export interface RevalidateCall {
  timestamp: number;
  headers: Record<string, string | string[] | undefined>;
  secret?: string;
  body: {
    tags?: string[];
    paths?: string[];
    [key: string]: any;
  };
  isValidSecret: boolean;
}

export class RevalidateMock {
  private server: http.Server | null = null;
  private calls: RevalidateCall[] = [];
  public readonly expectedSecret: string;
  public port: number = 0;
  public url: string = '';

  constructor(secret: string = process.env.REVALIDATE_SECRET || 'test-revalidate-secret-123') {
    this.expectedSecret = secret;
  }

  public async start(port: number = 0): Promise<{ url: string; port: number }> {
    if (this.server) {
      return { url: this.url, port: this.port };
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const receivedSecret = req.headers['x-revalidate-secret'] as string | undefined;
        let bodyRaw = '';

        req.on('data', (chunk) => {
          bodyRaw += chunk;
        });

        req.on('end', () => {
          let body = {};
          try {
            body = bodyRaw ? JSON.parse(bodyRaw) : {};
          } catch {
            body = { raw: bodyRaw };
          }

          const isValid = receivedSecret === this.expectedSecret;
          const callRecord: RevalidateCall = {
            timestamp: Date.now(),
            headers: req.headers,
            secret: receivedSecret,
            body,
            isValidSecret: isValid,
          };
          this.calls.push(callRecord);

          if (!isValid) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ revalidated: false, message: 'Invalid revalidation secret' }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              revalidated: true,
              now: Date.now(),
              tags: (body as any).tags || [],
              paths: (body as any).paths || [],
            })
          );
        });
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(port, () => {
        const addr = this.server?.address();
        if (typeof addr === 'object' && addr !== null) {
          this.port = addr.port;
          this.url = `http://localhost:${this.port}/api/revalidate`;
          resolve({ url: this.url, port: this.port });
        } else {
          reject(new Error('Failed to resolve server address'));
        }
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise((resolve, reject) => {
      const s = this.server;
      this.server = null;
      if (s) {
        if (typeof (s as any).closeAllConnections === 'function') {
          (s as any).closeAllConnections();
        }
        s.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public clear(): void {
    this.calls = [];
  }

  public getCalls(): RevalidateCall[] {
    return [...this.calls];
  }

  public getLastCall(): RevalidateCall | undefined {
    return this.calls[this.calls.length - 1];
  }

  public recordDirect(
    body: { tags?: string[]; paths?: string[] },
    secret?: string
  ): RevalidateCall {
    const call: RevalidateCall = {
      timestamp: Date.now(),
      headers: { 'x-revalidate-secret': secret },
      secret,
      body,
      isValidSecret: secret === this.expectedSecret,
    };
    this.calls.push(call);
    return call;
  }

  public assertCallCount(expected: number): void {
    if (this.calls.length !== expected) {
      throw new Error(
        `Expected ${expected} revalidate webhook calls, but received ${this.calls.length}`
      );
    }
  }

  public assertReceivedTag(tag: string): void {
    const found = this.calls.some((c) => c.body.tags?.includes(tag));
    if (!found) {
      throw new Error(
        `Expected revalidate webhook to receive tag "${tag}". Received tags: ${JSON.stringify(
          this.calls.map((c) => c.body.tags)
        )}`
      );
    }
  }

  public assertReceivedPath(path: string): void {
    const found = this.calls.some((c) => c.body.paths?.includes(path));
    if (!found) {
      throw new Error(
        `Expected revalidate webhook to receive path "${path}". Received paths: ${JSON.stringify(
          this.calls.map((c) => c.body.paths)
        )}`
      );
    }
  }
}
