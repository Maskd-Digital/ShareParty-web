import { redirect } from "next/navigation";
import { MemberPaymentCompleteClient } from "@/components/MemberPaymentClient";
import { MemberPageShell } from "@/components/MemberSidebar";
import { createClient } from "@/lib/supabase/server";

export default async function MemberJoinPaymentCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ library_id?: string }>;
}) {
  const { library_id: libraryId } = await searchParams;
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

  if (membership?.payment_status === "paid") {
    redirect("/member/catalog");
  }

  return (
    <MemberPageShell active="dashboard">
      <MemberPaymentCompleteClient libraryId={libraryId} />
    </MemberPageShell>
  );
}
