const http = require("http");
const fs = require("fs");
const path = require("path");
const session = "forgot-password-error";
const outdir = path.join(process.cwd(), ".dbg");
const logFile = path.join(outdir, "trae-debug-log-forgot-password-error.ndjson");
const envFile = path.join(outdir, "forgot-password-error.env");
fs.mkdirSync(outdir, { recursive: true });
fs.writeFileSync(logFile, "");
fs.writeFileSync(envFile, "DEBUG_SERVER_URL=http://127.0.0.1:7777/event\nDEBUG_SESSION_ID=forgot-password-error\n");
const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/event") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (!payload.ts) payload.ts = Date.now();
        fs.appendFileSync(logFile, JSON.stringify(payload) + "\n");
        res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
        res.end();
      } catch (error) {
        res.writeHead(400, { "Access-Control-Allow-Origin": "*" });
        res.end(String(error.message || error));
      }
    });
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    const count = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").split(/\r?\n/).filter(Boolean).length : 0;
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true, session, count }));
    return;
  }
  if (req.method === "DELETE" && req.url === "/logs") {
    fs.writeFileSync(logFile, "");
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    res.end();
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }
  res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
  res.end("not found");
});
server.listen(7777, "127.0.0.1", () => {
  console.log("debug-server http://127.0.0.1:7777 session forgot-password-error");
});
