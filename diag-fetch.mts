import http from 'node:http';

// 只测客户端读取路径:origin SSE → fetch → for await (response.body)
// 不经过 relay / WS,隔离 undici 迭代语义。
const origin = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.flushHeaders();
  let n = 0;
  res.write(`event: msg\ndata: ${n++}\n\n`);
  const timer = setInterval(() => {
    if (n >= 3) { clearInterval(timer); res.end(); return; }
    res.write(`event: msg\ndata: ${n++}\n\n`);
  }, 300);
});
await new Promise<void>((r) => origin.listen(0, '127.0.0.1', () => r()));
const port = (origin.address() as import('node:net').AddressInfo).port;

const response = await fetch(`http://127.0.0.1:${port}/sse`);
const body = response.body as unknown as AsyncIterable<Uint8Array>;
let i = 0;
for await (const chunk of body) {
  // 三种视角:原始字节、Buffer.from 拷贝后的字符串、base64
  const raw = Buffer.from(chunk).toString('utf8').trim();
  const b64 = Buffer.from(chunk).toString('base64');
  console.log(`iter#${i++}: len=${chunk.byteLength} text=${JSON.stringify(raw)} b64=${b64}`);
}
await new Promise<void>((r) => origin.close(() => r()));
console.log('done');
