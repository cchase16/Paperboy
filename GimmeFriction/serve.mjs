import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);

function readArg(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return fallback;
  }

  return args[index + 1];
}

const port = Number.parseInt(readArg("--port", "8000"), 10);
const host = readArg("--host", "127.0.0.1");
const siteRoot = path.dirname(fileURLToPath(import.meta.url));

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".htm", "text/html; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wav", "audio/wav"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
]);

const indexNames = ["Index.html", "index.html", "Index.htm", "index.htm"];

function isInsideRoot(targetPath) {
  const relative = path.relative(siteRoot, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveIndexFile(dirPath) {
  for (const name of indexNames) {
    const candidate = path.join(dirPath, name);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function resolveRequestPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  const relativePath = decodedPath === "/" ? "" : decodedPath.replace(/^\/+/, "");
  let targetPath = path.resolve(siteRoot, relativePath);

  if (!isInsideRoot(targetPath)) {
    throw Object.assign(new Error("Blocked path traversal attempt."), { statusCode: 403 });
  }

  let stats;
  try {
    stats = await fs.stat(targetPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      if (decodedPath === "/" || decodedPath.endsWith("/")) {
        const fallbackIndex = await resolveIndexFile(targetPath);
        if (fallbackIndex) {
          return fallbackIndex;
        }
      }

      throw Object.assign(new Error("Not found."), { statusCode: 404 });
    }

    throw error;
  }

  if (stats.isDirectory()) {
    const indexPath = await resolveIndexFile(targetPath);
    if (!indexPath) {
      throw Object.assign(new Error("Not found."), { statusCode: 404 });
    }
    targetPath = indexPath;
  }

  return targetPath;
}

function writeText(res, statusCode, body) {
  const buffer = Buffer.from(body, "utf8");
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": String(buffer.length),
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(buffer);
}

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      writeText(res, 400, "Missing request URL.");
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      writeText(res, 405, "Method not allowed.");
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host ?? `${host}:${port}`}`);
    const filePath = await resolveRequestPath(requestUrl.pathname);
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypes.get(ext) ?? "application/octet-stream";

    res.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": String(data.length),
      "Content-Type": contentType,
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    res.end(data);
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    writeText(res, statusCode, error?.message ?? "Internal server error.");
  }
});

server.listen(port, host, () => {
  console.log(`Serving ${siteRoot} at http://${host}:${port}/`);
  console.log("Press Ctrl+C to stop.");
});
