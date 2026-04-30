import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Operator-only: prevent members from creating libraries via this endpoint/RPC.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr || !profile || profile.role !== "operator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    library_name: string;
    country?: string | null;
    city?: string | null;
    postal_code?: string | null;
    phone_number?: string | null;
    contact_email?: string | null;
    description?: string | null;
    street_address?: string | null;
    suburb?: string | null;
    requires_paid_membership?: boolean;
    stripe_account_id?: string | null;
    is_setls_member?: boolean;
    max_items_per_member?: number;
    loan_period_days?: number;
    renewals_allowed?: boolean;
    late_return_policy?: string | null;
  };
  if (!body.library_name?.trim()) {
    return NextResponse.json({ error: "library_name required" }, { status: 400 });
  }

  // Avoid depending on PostgREST function schema cache by inserting directly.
  // Also naturally enforces the "one library per owner" unique constraint.
  const { data: existing } = await supabase
    .from("libraries")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (existing?.id) {
    return NextResponse.json({ libraryId: existing.id });
  }

  const { data: created, error: createErr } = await supabase
    .from("libraries")
    .insert({
      owner_user_id: user.id,
      library_name: body.library_name.trim(),
      country: body.country?.trim() ? body.country.trim() : null,
      city: body.city?.trim() ? body.city.trim() : null,
      postal_code: body.postal_code?.trim() ? body.postal_code.trim() : null,
      phone_number: body.phone_number?.trim() ? body.phone_number.trim() : null,
      contact_email: body.contact_email?.trim() ? body.contact_email.trim() : null,
      description: body.description?.trim() ? body.description.trim() : null,
      street_address: body.street_address?.trim() ? body.street_address.trim() : null,
      suburb: body.suburb?.trim() ? body.suburb.trim() : null,
      requires_paid_membership: body.requires_paid_membership ?? false,
      stripe_account_id: body.stripe_account_id?.trim() ? body.stripe_account_id.trim() : null,
      is_setls_member: body.is_setls_member ?? false,
      max_items_per_member: body.max_items_per_member,
      loan_period_days: body.loan_period_days,
      renewals_allowed: body.renewals_allowed,
      late_return_policy: body.late_return_policy?.trim() ? body.late_return_policy.trim() : null,
    })
    .select("id")
    .single();

  if (createErr || !created?.id) {
    return NextResponse.json({ error: createErr?.message ?? "Failed to create library" }, { status: 400 });
  }

  // Ensure membership exists for the owner.
  const { error: membershipErr } = await supabase.from("memberships").insert({ user_id: user.id, library_id: created.id });
  if (membershipErr) {
    // Don't fail the request if membership already exists or insertion is blocked by policy;
    // the library is created and the operator can retry membership setup later.
  }

  return NextResponse.json({ libraryId: created.id });
}
