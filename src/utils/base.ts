const baseUrl = import.meta.env.BASE_URL;

// `/blog/` -> `/blog`, `/` -> ``
const basePath = baseUrl === "/" ? "" : baseUrl.replace(/\/$/, "");

export function withBase(path: string) {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `${basePath}/${normalized}`;
}

export function stripBase(pathname: string) {
  if (!basePath) return pathname;
  return pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname;
}

