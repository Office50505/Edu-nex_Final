const http = require("http");
const net = require("net");

const LISTEN_PORT = Number(process.env.PROXY_PORT || 8888);
const TARGET_HOST = process.env.TARGET_HOST || "127.0.0.1";
const TARGET_PORT = Number(process.env.TARGET_PORT || 3001);

function targetPath(reqUrl) {
  try {
    const parsed = new URL(reqUrl);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return reqUrl || "/";
  }
}

const server = http.createServer((clientReq, clientRes) => {
  const upstream = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: clientReq.method,
      path: targetPath(clientReq.url),
      headers: {
        ...clientReq.headers,
        host: `${TARGET_HOST}:${TARGET_PORT}`,
      },
    },
    upstreamRes => {
      clientRes.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    }
  );

  upstream.on("error", err => {
    clientRes.writeHead(502, { "content-type": "application/json" });
    clientRes.end(JSON.stringify({ error: err.message }));
  });

  clientReq.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    upstream.write(
      `${req.method} ${targetPath(req.url)} HTTP/${req.httpVersion}\r\n` +
        Object.entries({ ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` })
          .map(([key, value]) => `${key}: ${value}`)
          .join("\r\n") +
        "\r\n\r\n"
    );
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });

  upstream.on("error", () => socket.destroy());
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
  console.log(
    `Proxy listening on http://0.0.0.0:${LISTEN_PORT} -> http://${TARGET_HOST}:${TARGET_PORT}`
  );
});
