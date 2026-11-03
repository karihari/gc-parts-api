import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { AppConfig } from '../config/app-config';
import { StorageService } from './storage.service';

// A tiny stand-in for the S3 API (path style: /<bucket>/<key>) so the real SDK client runs.
let server: Server;
let endpoint: string;
const objects = new Map<string, { body: Buffer; contentType: string; cacheControl?: string }>();
const seen: { method?: string; auth?: string }[] = [];

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      seen.push({ method: req.method, auth: req.headers.authorization });
      const key = decodeURIComponent((req.url ?? '').split('?')[0]);
      if (req.method === 'PUT') {
        objects.set(key, {
          body: await readBody(req),
          contentType: String(req.headers['content-type']),
          cacheControl: req.headers['cache-control'],
        });
        res.writeHead(200, { etag: '"x"' }).end();
      } else if (req.method === 'GET') {
        const o = objects.get(key);
        if (!o) {
          res
            .writeHead(404, { 'content-type': 'application/xml' })
            .end('<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>');
          return;
        }
        res.writeHead(200, { 'content-type': o.contentType }).end(o.body);
      } else if (req.method === 'DELETE') {
        objects.delete(key);
        res.writeHead(204).end();
      }
    })();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise((r) => server.close(r)));

const service = () =>
  new StorageService({
    storage: {
      endpoint,
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucket: 'media',
      publicUrl: 'https://media.example.am',
    },
  } as AppConfig);

describe('StorageService', () => {
  it('is disabled without configuration', () => {
    const s = new StorageService({} as AppConfig);
    expect(s.enabled).toBe(false);
    expect(s.publicUrl('a')).toBeUndefined();
    return expect(s.put('a', Buffer.from('x'), 'image/png')).rejects.toThrow(/not configured/);
  });

  it('writes, reads and deletes objects through the S3 API', async () => {
    const s = service();
    expect(s.enabled).toBe(true);
    expect(s.publicUrl('products/a')).toBe('https://media.example.am/products/a');

    await s.put('products/a', Buffer.from('hello'), 'image/png');
    expect(objects.get('/media/products/a')).toMatchObject({
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    expect(seen.at(-1)?.auth).toMatch(/^AWS4-HMAC-SHA256 Credential=key\//);

    const file = await s.get('products/a');
    expect(file?.bytes.toString()).toBe('hello');
    expect(file?.contentType).toBe('image/png');

    await s.delete('products/a');
    expect(await s.get('products/a')).toBeNull();
  });
});
