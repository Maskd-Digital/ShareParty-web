/**
 * Supabase Storage bucket for catalog intake toy photos (upload + AI download).
 * Override with `NEXT_PUBLIC_CATALOG_PHOTOS_BUCKET` only if you use a non-default bucket id.
 */
export const CATALOG_TOY_PHOTOS_BUCKET =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_CATALOG_PHOTOS_BUCKET?.trim()) || "toy-photos";

/**
 * Member return + operator return-review uploads. Default bucket id: `return-photos` (paths
 * `{library_id}/returns/...`). Override with `NEXT_PUBLIC_RETURN_PHOTOS_BUCKET` if needed.
 */
export const RETURN_PHOTOS_BUCKET =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RETURN_PHOTOS_BUCKET?.trim()) || "return-photos";
