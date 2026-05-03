import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG_TOY_PHOTOS_BUCKET } from "@/lib/catalogStorage";

/**
 * Signed URL for a private catalog photo path (storage object key under `toy-photos`).
 * Returns null if path missing, signing fails, or path looks like an absolute URL (legacy).
 */
export async function signedCatalogPhotoUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!storagePath?.trim()) return null;
  const path = storagePath.trim();
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const { data, error } = await supabase.storage
    .from(CATALOG_TOY_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
