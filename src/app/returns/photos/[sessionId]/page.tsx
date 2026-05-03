import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { ReturnPhotosClient } from "./ReturnPhotosClient";

export default async function ReturnPhotosPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!sessionId) redirect("/returns");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: s } = await supabase
    .from("return_inspection_sessions")
    .select("id,member_user_id,library_id,status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!s || s.member_user_id !== user.id) redirect("/returns");

  const { data: existingPhotos } = await supabase
    .from("session_photos")
    .select("shot_key")
    .eq("session_type", "return")
    .eq("return_session_id", sessionId);

  const initialUploaded: Record<string, number> = {};
  for (const p of existingPhotos ?? []) {
    if (p.shot_key) initialUploaded[p.shot_key] = (initialUploaded[p.shot_key] ?? 0) + 1;
  }

  if (s.status !== "draft") {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg px-4 py-12 text-center">
          <p className="text-sm text-forest-800/90">This return session is no longer editable.</p>
          <Link href="/returns" className="mt-4 inline-block text-sm font-semibold text-forest-800 underline">
            Back to my borrows
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ReturnPhotosClient sessionId={s.id} libraryId={s.library_id} initialUploaded={initialUploaded} />
    </AppShell>
  );
}
