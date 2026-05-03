import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { OperatorSidebar } from "@/components/OperatorSidebar";
import { signedCatalogPhotoUrl } from "@/lib/catalogItemImage";
import { createClient } from "@/lib/supabase/server";

const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Available",
  on_loan: "On loan",
  reserved: "Reserved",
  under_inspection: "Under inspection",
  retired: "Retired",
};

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

function formatAvailability(status: string | null): string {
  if (!status) return "—";
  return AVAILABILITY_LABEL[status] ?? status.replace(/_/g, " ");
}

function formatCondition(cond: string | null): string {
  if (!cond) return "—";
  return CONDITION_LABEL[cond] ?? cond;
}

type CatalogRow = {
  id: string;
  name: string;
  availability_status: string;
  image_url: string | null;
  condition: string | null;
  condition_score: number | null;
};

export default async function CatalogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profileRow?.role ?? "member";
  if (role !== "operator") redirect("/dashboard");

  const { data: lib } = await supabase.from("libraries").select("id").eq("owner_user_id", user.id).maybeSingle();
  const libraryId = lib?.id ?? null;

  let items: CatalogRow[] = [];
  const pendingReturnSessionByItemId = new Map<string, string>();
  if (libraryId) {
    const { data: rows } = await supabase
      .from("library_items")
      .select("id,name,availability_status,image_url,condition,condition_score")
      .eq("library_id", libraryId)
      .order("updated_at", { ascending: false });
    items = (rows ?? []) as CatalogRow[];

    const { data: pendingReturns } = await supabase
      .from("return_inspection_sessions")
      .select("id,item_id")
      .eq("library_id", libraryId)
      .eq("status", "submitted");
    for (const row of pendingReturns ?? []) {
      if (row.item_id && row.id) pendingReturnSessionByItemId.set(row.item_id, row.id);
    }
  }

  const itemsWithImages = await Promise.all(
    items.map(async (row) => ({
      ...row,
      imageSignedUrl: await signedCatalogPhotoUrl(supabase, row.image_url),
    })),
  );

  return (
    <AppShell variant="dashboard">
      <div className="grid gap-6 md:grid-cols-[240px_1fr] md:items-stretch">
        <OperatorSidebar active="catalog" />

        <main className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-bold text-forest-900">Manage catalog</h1>
          <p className="mt-2 text-sm text-forest-800/85">
            Browse items in your library, then add more with intake. New items get a condition score from intake when you save.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/catalog/intake" className="btn-primary inline-block no-underline">
              New intake
            </Link>
          </div>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-forest-900">Catalog items</h2>
            {!libraryId ? (
              <p className="mt-3 text-sm text-forest-700/85">No library found for this account.</p>
            ) : itemsWithImages.length === 0 ? (
              <p className="mt-3 text-sm text-forest-700/85">No items yet. Start a new intake to add your first toy.</p>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {itemsWithImages.map((item) => {
                  const pendingReturnId =
                    item.availability_status === "under_inspection"
                      ? pendingReturnSessionByItemId.get(item.id)
                      : undefined;
                  return (
                  <li
                    key={item.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-cream-300/80 bg-white/95 shadow-sm"
                  >
                    <div className="relative aspect-[4/3] w-full bg-cream-200/80">
                      {item.imageSignedUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs
                        <img src={item.imageSignedUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs font-medium text-forest-600/80">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <p className="line-clamp-2 font-semibold text-forest-900">{item.name}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-forest-800/10 px-2.5 py-1 font-semibold text-forest-900">
                          {formatAvailability(item.availability_status)}
                        </span>
                        <span className="rounded-full bg-cream-200 px-2.5 py-1 font-medium text-forest-800">
                          {formatCondition(item.condition)}
                        </span>
                      </div>
                      <p className="text-xs text-forest-700/90">
                        Condition score:{" "}
                        <span className="font-mono font-semibold text-forest-900">
                          {item.condition_score != null ? `${item.condition_score}` : "—"}
                        </span>
                        {item.condition_score == null ? (
                          <span className="text-forest-600/80"> (not recorded for this item)</span>
                        ) : null}
                      </p>
                      {pendingReturnId ? (
                        <Link
                          href={`/catalog/returns/${encodeURIComponent(pendingReturnId)}/review`}
                          className="btn-secondary mt-2 inline-block w-full text-center text-sm no-underline"
                        >
                          Start review
                        </Link>
                      ) : null}
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>
      </div>
    </AppShell>
  );
}
