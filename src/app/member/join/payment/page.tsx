import { redirect } from "next/navigation";
import { MemberPaymentClient } from "@/components/MemberPaymentClient";
import { MemberPageShell } from "@/components/MemberSidebar";
import { createClient } from "@/lib/supabase/server";

export default async function MemberJoinPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ library_id?: string; cancelled?: string }>;
}) {
  const { library_id: libraryId, cancelled } = await searchParams;
  if (!libraryId) redirect("/dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("payment_status")
    .eq("user_id", user.id)
    .eq("library_id", libraryId)
    .maybeSingle();

  if (membership?.payment_status === "paid") redirect("/member/catalog");

  const { data: lib } = await supabase
    .from("libraries")
    .select("library_name,requires_paid_membership,membership_fee_amount,membership_fee_currency")
    .eq("id", libraryId)
    .maybeSingle();

  if (!lib?.requires_paid_membership) redirect("/member/catalog");

  return (
    <MemberPageShell active="dashboard">
      <MemberPaymentClient
        libraryId={libraryId}
        libraryName={lib.library_name}
        feeAmount={lib.membership_fee_amount ?? 0}
        feeCurrency={lib.membership_fee_currency ?? "NZD"}
        cancelled={cancelled === "1"}
      />
    </MemberPageShell>
  );
}
