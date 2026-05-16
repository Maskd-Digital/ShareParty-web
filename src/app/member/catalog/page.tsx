import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberPageShell } from "@/components/MemberSidebar";
import { signedCatalogPhotoUrl } from "@/lib/catalogItemImage";
import { requireCatalogAccess } from "@/lib/requireMember";
import { createClient } from "@/lib/supabase/server";

const AVAILABILITY_LABEL: Record<string, string> = {
  available: "Available",
  on_loan: "On loan",
  reserved: "Reserved",
  under_inspection: "Under inspection",
  retired: "Retired",
};

export default async function MemberCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { ctx, libraryId } = await requireCatalogAccess();

  const supabase = await createClient();
  let query = supabase
    .from("library_items")
    .select("id,name,description,category,availability_status,image_url,condition,age_min,age_max")
    .eq("library_id", libraryId)
    .neq("availability_status", "retired")
    .order("name", { ascending: true });

  const search = q?.trim();
  if (search) {
    query = query.or(`name.ilike.%${search}%,category.ilike.%${search}%`);
  }

  const { data: items } = await query;

  const rows = await Promise.all(
    (items ?? []).map(async (row) => ({
      ...row,
      imageSignedUrl: await signedCatalogPhotoUrl(supabase, row.image_url as string | null),
    })),
  );

  const available = rows.filter((r) => r.availability_status === "available");

  return (
    <MemberPageShell active="catalog">
      <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-forest-900">Catalog</h1>
            <p className="mt-1 text-sm text-forest-800/85">{ctx.activeLibrary?.libraryName}</p>
          </div>

          <form className="flex w-full max-w-2xl flex-col gap-3" method="get">
            <input
              className="input-cream w-full"
              name="q"
              placeholder="Search toys by name or category…"
              defaultValue={search ?? ""}
            />
            <button type="submit" className="btn-secondary w-full">
              Search
            </button>
          </form>

          <p className="text-sm text-forest-700/90">
            {available.length} available · {rows.length} total
          </p>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((item) => (
              <li key={item.id} className="flex flex-col overflow-hidden rounded-xl border border-cream-300/80 bg-white/95 shadow-sm">
                <div className="relative aspect-[4/3] bg-cream-200/80">
                  {item.imageSignedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageSignedUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-forest-600/80">No image</div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <Link href={`/member/catalog/${item.id}`} className="font-semibold text-forest-900 no-underline hover:underline">
                    {item.name}
                  </Link>
                  <span className="w-fit rounded-full bg-forest-800/10 px-2.5 py-1 text-xs font-semibold text-forest-900">
                    {AVAILABILITY_LABEL[item.availability_status as string] ?? item.availability_status}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {rows.length === 0 ? <p className="text-sm text-forest-700">No toys in this library yet.</p> : null}
      </div>
    </MemberPageShell>
  );
}
