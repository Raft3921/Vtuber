import http from "node:http";
import dgram from "node:dgram";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { spawn } from "node:child_process";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = fileURLToPath(new URL(".", import.meta.url));
const httpPort = Number(process.env.VTUBER_PORT || 8777);
const discoveryPort = Number(process.env.VTUBER_DISCOVERY_PORT || 47777);
const instanceId = process.env.VTUBER_INSTANCE_ID || randomUUID();
const configRoot = process.env.VTUBER_CONFIG_ROOT || join(root, "config");
const defaultConfigRoot = join(root, "config");
await mkdir(configRoot, { recursive: true });
const memberConfigFiles = {
  "1": "raft-all-settings.json",
  "2": "mai-all-settings.json",
  "3": "tanutsuna-all-settings.json",
  "4": "yansan-all-settings.json",
  "5": "muto-all-settings.json",
  "6": "moron-all-settings.json",
  "8": "gyoza-all-settings.json",
};
const configFileForMember = (member) =>
  memberConfigFiles[member] || `member-${member}-all-settings.json`;

const weekRoot = join(root, "members", "week");
const clients = new Map(),
  latest = new Map(),
  latestAt = new Map(),
  lanPeers = new Map();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json",
};
const group = (id) => {
  if (!clients.has(id)) clients.set(id, new Set());
  return clients.get(id);
};

export const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const member = url.searchParams.get("member") || "7";
    if (url.pathname === "/lan/peers" && req.method === "GET") {
      const now = Date.now();
      for (const [id, peer] of lanPeers) if (now - peer.seenAt > 7000) lanPeers.delete(id);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify({ instanceId, peers: [...lanPeers.values()] }));
      return;
    }
    if (url.pathname === "/recording/export" && req.method === "POST") {
      const remote = req.socket.remoteAddress || "";
      if (!remote.includes("127.0.0.1") && remote !== "::1") { res.writeHead(403).end("Local access only"); return; }
      const format = url.searchParams.get("format") === "mp4" ? "mp4" : "mov";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const input = join(os.tmpdir(), `raft-vtuber-${instanceId}-${stamp}.webm`);
      const outputDir = process.env.VTUBER_RECORDING_DIR || join(os.homedir(), "Downloads");
      const output = join(outputDir, `RAFT-Vtuber-${stamp}.${format}`);
      try {
        await mkdir(outputDir, { recursive: true });
        const writer = createWriteStream(input);
        req.pipe(writer);
        await finished(writer);
        await new Promise((resolveConversion, rejectConversion) => {
          const args = ["-y", "-i", input, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output];
          const process = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
          let errorText = "";
          process.stderr.on("data", chunk => { if (errorText.length < 8000) errorText += chunk; });
          process.on("error", rejectConversion);
          process.on("close", code => code === 0 ? resolveConversion() : rejectConversion(new Error(errorText.slice(-3000) || `ffmpeg code ${code}`)));
        });
        const info = await stat(output);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ path: output, size: info.size, format }));
      } catch (error) {
        await rm(output, { force: true }).catch(() => {});
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ error: String(error?.message || error) }));
      } finally { await rm(input, { force: true }).catch(() => {}); }
      return;
    }
    if (url.pathname === "/settings") {
      const file = join(configRoot, configFileForMember(member));
      if (req.method === "GET") {
        try {
          const data = await readFile(file);
          res
            .writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
            })
            .end(data);
        } catch {
          try {
            const data = await readFile(
              join(defaultConfigRoot, configFileForMember(member)),
            );
            res
              .writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
              })
              .end(data);
          } catch {
            res
              .writeHead(404, {
                "Content-Type": "application/json; charset=utf-8",
              })
              .end(JSON.stringify({ error: "settings not found" }));
          }
        }
        return;
      }
      if (req.method === "POST") {
        let body = "";
        req.on("data", (c) => {
          if (body.length < 1000000) body += c;
        });
        req.on("end", async () => {
          try {
            const incoming = JSON.parse(body || "{}");
            await writeFile(file, JSON.stringify(incoming, null, 2), "utf8");
            res.writeHead(204).end();
          } catch (err) {
            res
              .writeHead(400, {
                "Content-Type": "application/json; charset=utf-8",
              })
              .end(JSON.stringify({ error: String(err?.message || err) }));
          }
        });
        return;
      }
      res.writeHead(405).end();
      return;
    }

    if (url.pathname === "/pose" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => {
        if (body.length < 30000) body += c;
      });
      req.on("end", () => {
        latest.set(member, body || "{}");
        latestAt.set(member, Date.now());
        for (const c of group(member))
          c.write(`data: ${latest.get(member)}\n\n`);
        res.writeHead(204).end();
      });
      return;
    }
    if (url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`data: ${latest.get(member) || "{}"}\n\n`);
      group(member).add(res);
      req.on("close", () => {
        const memberClients = clients.get(member);
        memberClients?.delete(res);
        if (memberClients?.size === 0) clients.delete(member);
      });
      return;
    }
    let base = root,
      pathname = url.pathname;
    if (pathname.startsWith("/week/")) {
      base = weekRoot;
      pathname = pathname.slice("/week".length);
      if (pathname === "/") pathname = "/index.html";
    } else if (pathname.startsWith("/shared/")) {
      base = join(root, "members", "shared");
      pathname = pathname.slice("/shared".length);
    } else if (/^\/[a-z0-9_-]+\//i.test(pathname)) {
      const [, slug, rest] = pathname.match(/^\/([a-z0-9_-]+)(\/.*)$/i);
      base = join(root, "members", slug);
      pathname = rest;
      if (pathname === "/") {
        base = join(root, "members", "shared");
        pathname = "/studio.html";
      }
    } else if (pathname === "/") pathname = "/index.html";
    const safe = normalize(decodeURIComponent(pathname)).replace(
      /^(\.\.(\/|\\|$))+/,
      "",
    );
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      const resolvedBase = resolve(base),
        file = resolve(resolvedBase, `.${safe.startsWith("/") ? safe : `/${safe}`}`),
        outside = relative(resolvedBase, file);
      if (outside.startsWith("..") || outside === "") throw new Error("invalid path");
      const info = await stat(file);
      if (!info.isFile()) throw new Error("not a file");
      const etag = `W/\"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}\"`,
        extension = extname(safe),
        cacheControl = extension === ".png" ? "public, max-age=3600" : "no-cache";
      const headers = {
        "Content-Type": mime[extension] || "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": cacheControl,
        "Last-Modified": info.mtime.toUTCString(),
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
      };
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304, headers).end();
        return;
      }
      res.writeHead(200, headers);
      if (req.method === "HEAD") res.end();
      else createReadStream(file).on("error", () => res.destroy()).pipe(res);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });

export const serverReady = new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(httpPort, "0.0.0.0", () => {
    server.off("error", reject);
    console.log(`RAFT Vtuber: http://127.0.0.1:${httpPort}/`);
    resolve(server);
  });
});

server.keepAliveTimeout = 5000;
server.headersTimeout = 10000;

await serverReady;

const discovery = dgram.createSocket({ type: "udp4", reuseAddr: true });
discovery.on("message", (message, remote) => {
  try {
    const data = JSON.parse(message.toString("utf8"));
    if (data.app !== "raft-vtuber" || data.instanceId === instanceId) return;
    lanPeers.set(data.instanceId, { instanceId: data.instanceId, name: data.name || remote.address, host: remote.address, port: Number(data.port || 8777), activeMembers: Array.isArray(data.activeMembers) ? data.activeMembers.map(String) : [], seenAt: Date.now() });
  } catch {}
});
discovery.bind(discoveryPort, "0.0.0.0", () => discovery.setBroadcast(true));
const advertise = () => {
  const now = Date.now(), activeMembers = [...latestAt].filter(([,at]) => now-at < 5000).map(([member]) => String(member));
  const packet = Buffer.from(JSON.stringify({ app: "raft-vtuber", instanceId, name: os.hostname(), port: httpPort, activeMembers }));
  discovery.send(packet, discoveryPort, "255.255.255.255", () => {});
};
advertise();
const discoveryTimer = setInterval(advertise, 2000);
discoveryTimer.unref();
server.on("close", () => discovery.close());
