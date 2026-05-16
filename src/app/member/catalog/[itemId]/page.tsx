import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberPageShell } from "@/components/MemberSidebar";
import { RequestBorrowButton } from "@/components/RequestBorrowButton";
import { signedCatalogPhotoUrl } from "@/lib/catalogItemImage";
import { requireCatalogAccess } from "@/lib/requireMember";
import { createClient } from "@/lib/supabase/server";

export default async function MemberCatalogItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const { libraryId } = await requireCatalogAccess();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: item } = await supabase
    .from("library_items")
    .select("id,name,description,category,availability_status,condition,age_min,age_max,image_url,library_id")
    .eq("id", itemId)
    .eq("library_id", libraryId)
    .maybeSingle();

  if (!item) notFound();

  const imageUrl = await signedCatalogPhotoUrl(supabase, item.image_url as string | null);

  const { data: lib } = await supabase.from("libraries").select("max_items_per_member").eq("id", libraryId).maybeSingle();

  const { count: activeLoans } = await supabase
    .from("loans")
    .select("*", { count: "exact", head: true })
    .eq("member_user_id", user!.id)
    .eq("library_id", libraryId)
    .in("status", ["active", "overdue", "return_pending", "reserved"]);

  const { data: pendingReq } = await supabase
    .from("loan_requests")
    .select("id")
    .eq("member_user_id", user!.id)
    .eq("item_id", itemId)
    .eq("status", "pending")
    .maybeSingle();

  const atLimit = (activeLoans ?? 0) >= (lib?.max_items_per_member ?? 3);
  const available = item.availability_status === "available";
  let disabledReason: string | undefined;
  if (!available) disabledReason = "This toy is not available to borrow right now.";
  else if (atLimit) disabledReason = "You have reached your borrow limit for this library.";
  else if (pendingReq?.id) disabledReason = "You already have a pending request for this toy.";

  return (
    <MemberPageShell active="catalog">
        <div className="space-y-6">
          <Link href="/member/catalog" className="text-sm font-medium text-forest-700 no-underline hover:underline">
            ← Back to catalog
          </Link>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="aspect-[4/3] overflow-hidden rounded-xl bg-cream-200/80">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-forest-600/80">No image</div>
              )}
            </div>
            <div className="space-y-3">
              <h1 className="text-2xl font-bold text-forest-900">{item.name}</h1>
              {item.category ? <p className="text-sm text-forest-700">{item.category}</p> : null}
              <p className="text-sm capitalize text-forest-800">{item.availability_status?.replace(/_/g, " ")}</p>
              {item.description ? <p className="text-sm text-forest-800/90">{item.description}</p> : null}
              {(item.age_min != null || item.age_max != null) && (
                <p className="text-sm text-forest-700">
                  Ages {item.age_min ?? "?"}–{item.age_max ?? "?"}
                </p>
              )}
              <RequestBorrowButton
                libraryId={libraryId}
                itemId={itemId}
                disabled={!available || atLimit || Boolean(pendingReq?.id)}
                disabledReason={disabledReason}
              />
            </div>
          </div>
        </div>
    </MemberPageShell>
  );
}
