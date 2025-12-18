const baseUrl = import.meta.env.BASE_URL;

// `/blog/` -> `/blog`, `/` -> ``
const basePath = baseUrl === "/" ? "" : baseUrl.replace(/\/$/, "");

export function withBase(path: string) {
  if (!basePath) {
    return path.startsWith("/") ? path : `/${path}`;
  }

  if (path === basePath || path.startsWith(`${basePath}/`)) {
    return path;
  }

  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${normalized}`;
}

export function stripBase(pathname: string) {
  if (!basePath) return pathname;
  return pathname.startsWith(basePath) ? pathname.slice(basePath.length) : pathname;
}
