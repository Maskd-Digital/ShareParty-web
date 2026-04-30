import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertLibraryOperator } from "@/lib/authz";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: libraryId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertLibraryOperator(supabase, user.id, libraryId);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  const body = (await request.json()) as {
    library_name?: string;
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

  const patch: Record<string, unknown> = {};
  if (body.library_name?.trim()) patch.library_name = body.library_name.trim();
  if (body.country !== undefined) patch.country = body.country?.trim() ? body.country.trim() : null;
  if (body.city !== undefined) patch.city = body.city?.trim() ? body.city.trim() : null;
  if (body.postal_code !== undefined) patch.postal_code = body.postal_code?.trim() ? body.postal_code.trim() : null;
  if (body.phone_number !== undefined) patch.phone_number = body.phone_number?.trim() ? body.phone_number.trim() : null;
  if (body.contact_email !== undefined) patch.contact_email = body.contact_email?.trim() ? body.contact_email.trim() : null;
  if (body.description !== undefined) patch.description = body.description?.trim() ? body.description.trim() : null;
  if (body.street_address !== undefined) patch.street_address = body.street_address?.trim() ? body.street_address.trim() : null;
  if (body.suburb !== undefined) patch.suburb = body.suburb?.trim() ? body.suburb.trim() : null;
  if (body.requires_paid_membership !== undefined) patch.requires_paid_membership = body.requires_paid_membership;
  if (body.stripe_account_id !== undefined) patch.stripe_account_id = body.stripe_account_id;
  if (body.is_setls_member !== undefined) patch.is_setls_member = body.is_setls_member;
  if (body.max_items_per_member !== undefined) patch.max_items_per_member = body.max_items_per_member;
  if (body.loan_period_days !== undefined) patch.loan_period_days = body.loan_period_days;
  if (body.renewals_allowed !== undefined) patch.renewals_allowed = body.renewals_allowed;
  if (body.late_return_policy !== undefined)
    patch.late_return_policy = body.late_return_policy?.trim() ? body.late_return_policy.trim() : null;

  const { error } = await supabase.from("libraries").update(patch).eq("id", libraryId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
