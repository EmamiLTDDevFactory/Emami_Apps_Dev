/**
 * Screen limit from Manage Access. A screen's id is its route without slashes ('pending-approval'); the list of ids
 * must match backend/appTiles.js. The limit only narrows what the role already shows.
 */
export const tileIdOf = (href: string): string => href.replace(/^\/+|\/+$/g, '');

/** null = no limit. */
export const tileAllowed = (tiles: string[] | null | undefined, hrefOrId: string): boolean => !tiles || tiles.includes(tileIdOf(hrefOrId));
