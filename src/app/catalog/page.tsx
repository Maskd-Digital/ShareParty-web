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

const LOAN_STATUS_LABEL: Record<string, string> = {
  reserved: "Reserved",
  active: "On loan",
  overdue: "Overdue",
  return_pending: "Return pending review",
  returned: "Returned",
  cancelled: "Cancelled",
};

function formatAvailability(status: string | null): string {
  if (!status) return "—";
  return AVAILABILITY_LABEL[status] ?? status.replace(/_/g, " ");
}

function formatCondition(cond: string | null): string {
  if (!cond) return "—";
  return CONDITION_LABEL[cond] ?? cond;
}

function formatLoanStatus(status: string | null): string {
  if (!status) return "—";
  return LOAN_STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

type CatalogRow = {
  id: string;
  name: string;
  availability_status: string;
  image_url: string | null;
  condition: string | null;
  condition_score: number | null;
};

type CatalogRowWithUrl = CatalogRow & { imageSignedUrl: string | null };

type LoanRow = { id: string; item_id: string; status: string };

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
  const loanByItemId = new Map<string, LoanRow>();
  const reviewSessionByItemId = new Map<string, string>();

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

    const { data: loans } = await supabase
      .from("loans")
      .select("id,item_id,status")
      .eq("library_id", libraryId)
      .in("status", ["reserved", "active", "overdue", "return_pending"]);

    for (const row of loans ?? []) {
      if (row.item_id && row.id && row.status) {
        loanByItemId.set(row.item_id, { id: row.id as string, item_id: row.item_id as string, status: row.status as string });
      }
    }

    const pendingReviewItemIds = (loans ?? [])
      .filter((l) => l.status === "return_pending" && l.item_id)
      .map((l) => l.item_id as string);

    if (pendingReviewItemIds.length > 0) {
      const { data: reviewSessions } = await supabase
        .from("return_inspection_sessions")
        .select("id,item_id")
        .eq("library_id", libraryId)
        .eq("status", "submitted")
        .in("item_id", pendingReviewItemIds);
      for (const s of reviewSessions ?? []) {
        if (s.item_id && s.id) reviewSessionByItemId.set(s.item_id, s.id as string);
      }
    }
  }

  const itemsWithImages: CatalogRowWithUrl[] = await Promise.all(
    items.map(async (row) => ({
      ...row,
      imageSignedUrl: await signedCatalogPhotoUrl(supabase, row.image_url),
    })),
  );

  const loanedItems = itemsWithImages.filter((row) => loanByItemId.has(row.id));
  const availableItems = itemsWithImages.filter((row) => !loanByItemId.has(row.id));

  function reviewHref(itemId: string): string | null {
    const loan = loanByItemId.get(itemId);
    const fromLoan = loan?.status === "return_pending" ? reviewSessionByItemId.get(itemId) : undefined;
    const sessionId = fromLoan ?? pendingReturnSessionByItemId.get(itemId);
    return sessionId ? `/catalog/returns/${encodeURIComponent(sessionId)}/review` : null;
  }

  function showStartReview(item: CatalogRowWithUrl): boolean {
    const loan = loanByItemId.get(item.id);
    const href = reviewHref(item.id);
    if (!href) return false;
    if (loan?.status === "return_pending") return true;
    if (item.availability_status === "under_inspection") return true;
    return false;
  }

  function renderCard(item: CatalogRowWithUrl) {
    const loan = loanByItemId.get(item.id);
    const startReviewHref = showStartReview(item) ? reviewHref(item.id) : null;

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
            <div className="flex h-full items-center justify-center text-xs font-medium text-forest-600/80">No image</div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <p className="line-clamp-2 font-semibold text-forest-900">{item.name}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-forest-800/10 px-2.5 py-1 font-semibold text-forest-900">
              {formatAvailability(item.availability_status)}
            </span>
            {loan ? (
              <span className="rounded-full bg-sky-100 px-2.5 py-1 font-semibold text-sky-950">
                {formatLoanStatus(loan.status)}
              </span>
            ) : null}
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
          {startReviewHref ? (
            <Link
              href={startReviewHref}
              className="btn-secondary mt-2 inline-block w-full text-center text-sm no-underline"
            >
              Start review
            </Link>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <AppShell variant="dashboard">
      <div className="grid gap-6 md:grid-cols-[240px_1fr] md:items-stretch">
        <OperatorSidebar active="catalog" />

        <main className="rounded-2xl border border-cream-300/90 bg-cream-50/90 p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-bold text-forest-900">Manage catalog</h1>
          <p className="mt-2 text-sm text-forest-800/85">
            Items on loan are listed separately (loan statuses reserved, active, overdue, or return_pending). After a member
            submits return photos, the loan becomes return_pending and you can start the review from the card.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/catalog/intake" className="btn-primary inline-block no-underline">
              New intake
            </Link>
          </div>

          {!libraryId ? (
            <p className="mt-10 text-sm text-forest-700/85">No library found for this account.</p>
          ) : (
            <>
              <section className="mt-10">
                <h2 className="text-lg font-semibold text-forest-900">On loan</h2>
                <p className="mt-1 text-sm text-forest-800/80">
                  Pulled from the loans table: reserved, active, overdue, or return_pending (awaiting operator return review).
                </p>
                {loanedItems.length === 0 ? (
                  <p className="mt-3 text-sm text-forest-700/85">Nothing on loan right now.</p>
                ) : (
                  <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{loanedItems.map(renderCard)}</ul>
                )}
              </section>

              <section className="mt-12">
                <h2 className="text-lg font-semibold text-forest-900">Available &amp; other</h2>
                <p className="mt-1 text-sm text-forest-800/80">Catalog entries without an open loan on the books.</p>
                {availableItems.length === 0 ? (
                  <p className="mt-3 text-sm text-forest-700/85">All items currently have an open loan row.</p>
                ) : (
                  <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{availableItems.map(renderCard)}</ul>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </AppShell>
  );
}
