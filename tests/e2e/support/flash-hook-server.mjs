import { readFileSync } from "node:fs";
import { createServer } from "node:https";

const [keyPath, certificatePath] = process.argv.slice(2);

const server = createServer({
  cert: readFileSync(certificatePath),
  key: readFileSync(keyPath),
}, (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  if (request.method === "POST" && request.url === "/flash") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      action: "continue",
      payload: { emailVerified: true },
    }));
    return;
  }
  response.writeHead(404).end();
});

server.listen(3443, "127.0.0.1");
