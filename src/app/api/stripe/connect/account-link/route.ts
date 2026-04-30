import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertLibraryOperator } from "@/lib/authz";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { libraryId: string };
  if (!body.libraryId) {
    return NextResponse.json({ error: "libraryId required" }, { status: 400 });
  }

  try {
    await assertLibraryOperator(supabase, user.id, body.libraryId);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  const { data: lib, error: libErr } = await supabase
    .from("libraries")
    .select("stripe_account_id")
    .eq("id", body.libraryId)
    .single();

  if (libErr || !lib) {
    return NextResponse.json({ error: "Library not found" }, { status: 404 });
  }

  const stripe = getStripe();
  let accountId = lib.stripe_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "NZ",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { library_id: body.libraryId },
    });
    accountId = account.id;
    const { error: upErr } = await supabase
      .from("libraries")
      .update({ stripe_account_id: accountId })
      .eq("id", body.libraryId);
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
  }

  const { origin } = new URL(request.url);
  const base =
    process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : origin);

  const refreshUrl = `${base}/onboarding?step=payments`;
  const returnUrl = `${base}/api/stripe/connect/return?library_id=${encodeURIComponent(body.libraryId)}`;

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url });
}
