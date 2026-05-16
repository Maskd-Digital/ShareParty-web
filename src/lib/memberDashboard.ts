import { createClient } from "@/lib/supabase/server";
import { loadMemberContext } from "@/lib/memberContext";

export type MemberDashboardStats = {
  activeBorrows: number;
  overdueBorrows: number;
  returnPending: number;
  pendingBorrowRequests: number;
  totalReturns: number;
  childrenCount: number;
};

export type MemberActivityItem = {
  id: string;
  kind:
    | "loan_active"
    | "loan_overdue"
    | "loan_return_pending"
    | "loan_returned"
    | "loan_request_pending"
    | "loan_request_decided"
    | "membership_pending"
    | "membership_decided";
  title: string;
  subtitle: string | null;
  at: string;
  href: string | null;
};

export type MemberDashboardData = {
  stats: MemberDashboardStats;
  activity: MemberActivityItem[];
  libraryName: string | null;
};

const LOAN_ACTIVE = ["active", "overdue", "return_pending", "reserved"] as const;

export async function loadMemberDashboardData(userId: string): Promise<MemberDashboardData> {
  const supabase = await createClient();
  const ctx = await loadMemberContext();
  const libraryId = ctx?.activeLibrary?.libraryId ?? null;
  const libraryName = ctx?.activeLibrary?.libraryName ?? ctx?.memberships[0]?.libraryName ?? null;

  const loansQuery = supabase
    .from("loans")
    .select("id,item_id,status,due_date,returned_at,created_at,updated_at,library_id")
    .eq("member_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);

  const loanReqQuery = supabase
    .from("loan_requests")
    .select("id,item_id,status,requested_at,reviewed_at,member_note")
    .eq("member_user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(20);

  const membershipReqQuery = supabase
    .from("membership_requests")
    .select("id,library_id,status,created_at,reviewed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const childrenQuery = supabase
    .from("member_children")
    .select("*", { count: "exact", head: true })
    .eq("member_user_id", userId);

  if (libraryId) {
    loansQuery.eq("library_id", libraryId);
    loanReqQuery.eq("library_id", libraryId);
  }

  const [{ data: loans }, { data: loanReqs }, { data: memReqs }, { count: childrenCount }] = await Promise.all([
    loansQuery,
    loanReqQuery,
    membershipReqQuery,
    childrenQuery,
  ]);

  const loanRows = loans ?? [];
  const itemIds = Array.from(new Set(loanRows.map((l) => l.item_id as string)));
  const loanReqItemIds = Array.from(new Set((loanReqs ?? []).map((r) => r.item_id as string)));
  const allItemIds = Array.from(new Set([...itemIds, ...loanReqItemIds]));

  let itemNames = new Map<string, string>();
  if (allItemIds.length) {
    const { data: items } = await supabase.from("library_items").select("id,name").in("id", allItemIds);
    itemNames = new Map((items ?? []).map((i) => [i.id as string, i.name as string]));
  }

  const libIds = Array.from(new Set((memReqs ?? []).map((r) => r.library_id as string)));
  let libNames = new Map<string, string>();
  if (libIds.length) {
    const cards = await Promise.all(libIds.map((id) => supabase.rpc("get_library_join_card", { p_library_id: id })));
    libIds.forEach((id, i) => {
      const row = Array.isArray(cards[i].data) ? cards[i].data?.[0] : cards[i].data;
      if (row?.library_name) libNames.set(id, row.library_name as string);
    });
  }

  const activeBorrows = loanRows.filter((l) =>
    LOAN_ACTIVE.includes(l.status as (typeof LOAN_ACTIVE)[number]),
  ).length;
  const overdueBorrows = loanRows.filter((l) => l.status === "overdue").length;
  const returnPending = loanRows.filter((l) => l.status === "return_pending").length;
  const totalReturns = loanRows.filter((l) => l.status === "returned" || l.returned_at).length;
  const pendingBorrowRequests = (loanReqs ?? []).filter((r) => r.status === "pending").length;

  const activity: MemberActivityItem[] = [];

  for (const loan of loanRows) {
    const name = itemNames.get(loan.item_id as string) ?? "Toy";
    const due = loan.due_date as string;

    if (loan.status === "returned" && loan.returned_at) {
      activity.push({
        id: `loan-returned-${loan.id}`,
        kind: "loan_returned",
        title: `Returned ${name}`,
        subtitle: null,
        at: loan.returned_at as string,
        href: "/returns",
      });
    } else if (loan.status === "overdue") {
      activity.push({
        id: `loan-overdue-${loan.id}`,
        kind: "loan_overdue",
        title: `${name} is overdue`,
        subtitle: `Due ${formatDate(due)}`,
        at: due,
        href: "/returns",
      });
    } else if (loan.status === "return_pending") {
      activity.push({
        id: `loan-rp-${loan.id}`,
        kind: "loan_return_pending",
        title: `Return pending review: ${name}`,
        subtitle: null,
        at: (loan.updated_at as string) ?? due,
        href: "/returns",
      });
    } else if (LOAN_ACTIVE.includes(loan.status as (typeof LOAN_ACTIVE)[number])) {
      activity.push({
        id: `loan-active-${loan.id}`,
        kind: loan.status === "overdue" ? "loan_overdue" : "loan_active",
        title: `Borrowed ${name}`,
        subtitle: `Due ${formatDate(due)}`,
        at: (loan.created_at as string) ?? due,
        href: "/returns",
      });
    }
  }

  for (const req of loanReqs ?? []) {
    const name = itemNames.get(req.item_id as string) ?? "Toy";
    if (req.status === "pending") {
      activity.push({
        id: `lr-pending-${req.id}`,
        kind: "loan_request_pending",
        title: `Borrow request: ${name}`,
        subtitle: "Awaiting operator",
        at: req.requested_at as string,
        href: "/member/requests",
      });
    } else if (req.reviewed_at) {
      activity.push({
        id: `lr-done-${req.id}`,
        kind: "loan_request_decided",
        title: `Borrow request ${req.status}: ${name}`,
        subtitle: null,
        at: req.reviewed_at as string,
        href: "/member/requests",
      });
    }
  }

  for (const req of memReqs ?? []) {
    const libLabel = libNames.get(req.library_id as string) ?? "Library";
    if (req.status === "pending") {
      activity.push({
        id: `mr-pending-${req.id}`,
        kind: "membership_pending",
        title: `Join request: ${libLabel}`,
        subtitle: "Awaiting approval",
        at: req.created_at as string,
        href: "/member/requests",
      });
    } else if (req.reviewed_at) {
      activity.push({
        id: `mr-done-${req.id}`,
        kind: "membership_decided",
        title: `Membership ${req.status}: ${libLabel}`,
        subtitle: null,
        at: req.reviewed_at as string,
        href: req.status === "approved" ? `/member/join/payment?library_id=${req.library_id}` : "/member/requests",
      });
    }
  }

  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    libraryName,
    stats: {
      activeBorrows,
      overdueBorrows,
      returnPending,
      pendingBorrowRequests,
      totalReturns,
      childrenCount: childrenCount ?? 0,
    },
    activity: activity.slice(0, 12),
  };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
