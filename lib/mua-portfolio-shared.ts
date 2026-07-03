export const MUA_PORTFOLIO_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const MAX_MUA_PORTFOLIO_BYTES = 8 * 1024 * 1024;
export const MAX_MUA_PORTFOLIO_ITEMS = 24;

export function isLocalPortfolioPath(mediaUrl: string): boolean {
  return mediaUrl.startsWith("/uploads/mua-portfolio/");
}

export function isPortfolioImageUrl(url: string): boolean {
  if (isLocalPortfolioPath(url)) return true;
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
}
