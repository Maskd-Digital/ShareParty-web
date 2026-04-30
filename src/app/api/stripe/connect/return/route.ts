import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertLibraryOperator } from "@/lib/authz";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const libraryId = url.searchParams.get("library_id");
  if (!libraryId) {
    return NextResponse.redirect(new URL("/onboarding?error=missing_library", request.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await assertLibraryOperator(supabase, user.id, libraryId);
  } catch {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // If this library requires paid memberships, mark the operator's membership as pending.
  // (Actual payment should happen in later flows that create membership_payments rows.)
  const { data: lib } = await supabase
    .from("libraries")
    .select("requires_paid_membership")
    .eq("id", libraryId)
    .maybeSingle();

  if (lib?.requires_paid_membership) {
    await supabase
      .from("memberships")
      .update({ payment_status: "pending" })
      .eq("user_id", user.id)
      .eq("library_id", libraryId);
  }

  return NextResponse.redirect(new URL(`/onboarding?step=golive`, request.url));
}
