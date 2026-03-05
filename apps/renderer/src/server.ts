import * as http from "node:http";

const port = Number(process.env.PORT ?? "8080");

const server = http.createServer((_, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "renderer" }));
});

server.listen(port, () => {
  console.log(`Renderer service listening on ${port}`);
});
