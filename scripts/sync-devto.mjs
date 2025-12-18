import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import kebabcase from "lodash.kebabcase";

const API = "https://dev.to/api";

const devtoApiKey = process.env.DEVTO_API_KEY;
const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");
const userAgent = process.env.USER_AGENT || "github-actions-devto-sync";
const postsDir = process.env.POSTS_DIR || "src/data/blog";
const postsDirAbs = path.resolve(postsDir);

const headers = {
  "api-key": devtoApiKey,
  accept: "application/vnd.forem.api-v1+json",
  "user-agent": userAgent,
  "content-type": "application/json",
};

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function devFetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { ...headers, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

function canonicalUrlForFile(filePath) {
  const rel = path
    .relative(postsDirAbs, filePath)
    .split(path.sep)
    .join("/");
  const withoutExt = rel.replace(/\.(md|mdx)$/i, "");
  const segments = withoutExt
    .split("/")
    .filter(Boolean)
    .filter(s => !s.startsWith("_"))
    .map(s => kebabcase(s));

  return `${siteUrl}/posts/${segments.join("/")}`;
}

async function listFilesRecursive(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
    } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function loadFiles() {
  const listFile = getArgValue("--files");
  if (listFile) {
    const text = await fs.readFile(listFile, "utf8");
    return text
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean)
      .filter(p => /\.(md|mdx)$/i.test(p))
      .map(p => (path.isAbsolute(p) ? p : path.join(process.cwd(), p)));
  }

  return listFilesRecursive(postsDirAbs);
}

if (!devtoApiKey) throw new Error("DEVTO_API_KEY is missing");
if (!siteUrl) throw new Error("SITE_URL is missing");

const files = await loadFiles();
if (files.length === 0) {
  console.log("No markdown files to sync.");
  process.exit(0);
}

const myArticles = await devFetchJson(`${API}/articles/me/all?per_page=1000&page=1`);
const byCanonicalUrl = new Map(
  myArticles
    .filter(a => typeof a?.canonical_url === "string" && a.canonical_url.length > 0)
    .map(a => [a.canonical_url, a])
);

for (const filePath of files) {
  const raw = await fs.readFile(filePath, "utf8");
  const { data, content } = matter(raw);

  const title = data.title;
  const description = data.description || "";
  const published = data.draft ? false : true;
  const canonical_url = canonicalUrlForFile(filePath);

  const tags = Array.isArray(data.tags)
    ? data.tags.map(String).slice(0, 4)
    : typeof data.tags === "string"
      ? [data.tags].slice(0, 4)
      : [];

  const payload = {
    article: {
      title,
      body_markdown: content.trim(),
      tags,
      description,
      canonical_url,
      published,
    },
  };

  const existing = byCanonicalUrl.get(canonical_url);
  if (!existing) {
    await devFetchJson(`${API}/articles`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.log(`Created: ${canonical_url}`);
    continue;
  }

  await devFetchJson(`${API}/articles/${existing.id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  console.log(`Updated: ${canonical_url}`);
}
