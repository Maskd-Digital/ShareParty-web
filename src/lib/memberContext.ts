import { createClient } from "@/lib/supabase/server";
import { hasCatalogAccess } from "@/lib/server/membershipAccess";

export type MemberLibraryContext = {
  libraryId: string;
  libraryName: string;
  requiresPaidMembership: boolean;
  maxItemsPerMember: number;
  loanPeriodDays: number;
};

export type MemberContext = {
  userId: string;
  email: string | null;
  role: string;
  memberships: Array<{
    id: string;
    libraryId: string;
    status: string;
    paymentStatus: string;
    libraryName: string;
    requiresPaidMembership: boolean;
    hasCatalogAccess: boolean;
  }>;
  pendingMembershipRequests: Array<{
    id: string;
    libraryId: string;
    status: string;
    libraryName: string | null;
  }>;
  /** First membership with catalog access, or first membership overall */
  activeLibrary: MemberLibraryContext | null;
  /** Membership approved but payment pending */
  paymentRequiredLibrary: { libraryId: string; libraryName: string; membershipId: string } | null;
};

export async function loadMemberContext(): Promise<MemberContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role,email").eq("id", user.id).maybeSingle();

  const { data: membershipRows } = await supabase
    .from("memberships")
    .select(
      "id,library_id,status,payment_status,libraries(library_name,requires_paid_membership,max_items_per_member,loan_period_days)",
    )
    .eq("user_id", user.id)
    .eq("status", "active");

  type LibJoin = {
    library_name: string;
    requires_paid_membership: boolean;
    max_items_per_member: number;
    loan_period_days: number;
  };

  function joinLibrary(raw: unknown): LibJoin | null {
    if (!raw) return null;
    if (Array.isArray(raw)) return (raw[0] as LibJoin) ?? null;
    return raw as LibJoin;
  }

  const memberships =
    membershipRows?.map((m) => {
      const lib = joinLibrary(m.libraries);
      const row = {
        status: m.status as string,
        payment_status: m.payment_status as string,
      };
      const libPay = { requires_paid_membership: Boolean(lib?.requires_paid_membership) };
      return {
        id: m.id as string,
        libraryId: m.library_id as string,
        status: m.status as string,
        paymentStatus: m.payment_status as string,
        libraryName: lib?.library_name ?? "Library",
        requiresPaidMembership: Boolean(lib?.requires_paid_membership),
        hasCatalogAccess: hasCatalogAccess(row, libPay),
      };
    }) ?? [];

  const { data: pendingReqs } = await supabase
    .from("membership_requests")
    .select("id,library_id,status")
    .eq("user_id", user.id)
    .eq("status", "pending");

  const pendingMembershipRequests =
    pendingReqs?.map((r) => ({
      id: r.id as string,
      libraryId: r.library_id as string,
      status: r.status as string,
      libraryName: null as string | null,
    })) ?? [];

  const withAccess = memberships.find((m) => m.hasCatalogAccess);
  const firstMembership = memberships[0];
  const chosen = withAccess ?? firstMembership;

  const activeLibrary: MemberLibraryContext | null = chosen?.hasCatalogAccess
    ? {
        libraryId: chosen.libraryId,
        libraryName: chosen.libraryName,
        requiresPaidMembership: chosen.requiresPaidMembership,
        maxItemsPerMember: 3,
        loanPeriodDays: 14,
      }
    : null;

  if (chosen?.hasCatalogAccess && membershipRows) {
    const raw = membershipRows.find((m) => m.library_id === chosen.libraryId);
    const lib = joinLibrary(raw?.libraries);
    if (activeLibrary && lib) {
      activeLibrary.maxItemsPerMember = lib.max_items_per_member ?? 3;
      activeLibrary.loanPeriodDays = lib.loan_period_days ?? 14;
    }
  }

  const unpaid = memberships.find((m) => m.requiresPaidMembership && m.paymentStatus === "pending");
  const paymentRequiredLibrary = unpaid
    ? { libraryId: unpaid.libraryId, libraryName: unpaid.libraryName, membershipId: unpaid.id }
    : null;

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? null,
    role: profile?.role ?? "member",
    memberships,
    pendingMembershipRequests,
    activeLibrary,
    paymentRequiredLibrary,
  };
}
