import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { assertLibraryOperator } from "@/lib/authz";
import { signedCatalogPhotoUrl, signedReturnPhotoUrl } from "@/lib/catalogItemImage";
import { RETURN_PHOTOS_BUCKET } from "@/lib/catalogStorage";
import { createClient } from "@/lib/supabase/server";
import { ReturnReviewClient } from "./ReturnReviewClient";

export default async function ReturnReviewPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!sessionId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profileRow?.role ?? "member") !== "operator") redirect("/dashboard");

  const { data: session, error: sErr } = await supabase
    .from("return_inspection_sessions")
    .select("id,library_id,item_id,status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr || !session) notFound();
  if (session.status !== "submitted") redirect("/catalog");

  try {
    await assertLibraryOperator(supabase, user.id, session.library_id);
  } catch {
    notFound();
  }

  const { data: item } = await supabase
    .from("library_items")
    .select("name,image_url,photo_urls")
    .eq("id", session.item_id)
    .maybeSingle();

  if (!item) notFound();

  const { data: photos } = await supabase
    .from("session_photos")
    .select("shot_key,url,created_at")
    .eq("session_type", "return")
    .eq("return_session_id", sessionId)
    .order("created_at", { ascending: true });

  const rows = photos ?? [];
  const memberRows = rows.filter((r) => r.shot_key !== "operator_addendum");
  const operatorRow = rows.find((r) => r.shot_key === "operator_addendum");

  const memberPhotos = await Promise.all(
    memberRows.map(async (r) => ({
      shot_key: r.shot_key,
      signedUrl: await signedReturnPhotoUrl(supabase, r.url),
    })),
  );

  const operatorPhotoSigned = operatorRow?.url ? await signedReturnPhotoUrl(supabase, operatorRow.url) : null;

  const catalogPaths: string[] = [];
  const pushPath = (p: string | null | undefined) => {
    if (!p || typeof p !== "string") return;
    const t = p.trim();
    if (!t || t.startsWith("http://") || t.startsWith("https://")) return;
    if (!catalogPaths.includes(t)) catalogPaths.push(t);
  };
  pushPath(item.image_url);
  if (Array.isArray(item.photo_urls)) {
    for (const u of item.photo_urls) pushPath(typeof u === "string" ? u : null);
  }

  const catalogPhotosSigned = (
    await Promise.all(catalogPaths.map((path) => signedCatalogPhotoUrl(supabase, path)))
  ).filter((u): u is string => Boolean(u));

  const { data: reportRows } = await supabase
    .from("ai_return_reports")
    .select("id,created_at,condition_score,condition_label,findings,needs_manual_review")
    .eq("return_session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(8);

  const initialReports = (reportRows ?? []).map((r) => ({
    id: r.id as string,
    created_at: r.created_at as string,
    condition_score: r.condition_score as number | null,
    condition_label: r.condition_label as string | null,
    findings: (r.findings && typeof r.findings === "object" ? r.findings : {}) as Record<string, unknown>,
    needs_manual_review: Boolean(r.needs_manual_review),
  }));

  return (
    <AppShell variant="dashboard">
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-forest-700/80">Return review</p>
            <h1 className="text-2xl font-bold text-forest-900">{item.name}</h1>
            <p className="mt-1 text-sm text-forest-800/85">
              Member return shots are loaded from the return photos bucket (<span className="font-mono text-xs">{RETURN_PHOTOS_BUCKET}</span>).
              Run AI either against those user uploads plus catalog intake references, or against a fresh on-the-spot verification
              capture, then close the return.
            </p>
          </div>
          <Link href="/catalog" className="text-sm font-semibold text-forest-700 underline decoration-forest-600/30 underline-offset-2">
            Back to catalog
          </Link>
        </div>

        <ReturnReviewClient
          sessionId={sessionId}
          libraryId={session.library_id}
          itemName={item.name}
          returnPhotosBucket={RETURN_PHOTOS_BUCKET}
          memberPhotos={memberPhotos}
          operatorPhotoSigned={operatorPhotoSigned}
          catalogPhotosSigned={catalogPhotosSigned}
          initialReports={initialReports}
        />
      </div>
    </AppShell>
  );
}
