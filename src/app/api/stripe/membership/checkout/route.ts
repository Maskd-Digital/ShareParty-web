import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { library_id?: string };
  const libraryId = body.library_id?.trim();
  if (!libraryId) return NextResponse.json({ error: "library_id required" }, { status: 400 });

  const { data: membership, error: mErr } = await supabase
    .from("memberships")
    .select("id,payment_status")
    .eq("user_id", user.id)
    .eq("library_id", libraryId)
    .eq("status", "active")
    .maybeSingle();

  if (mErr || !membership) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }
  if (membership.payment_status === "paid") {
    return NextResponse.json({ error: "Already paid" }, { status: 400 });
  }
  if (membership.payment_status !== "pending") {
    return NextResponse.json({ error: "Payment not required" }, { status: 400 });
  }

  const { data: lib, error: libErr } = await supabase
    .from("libraries")
    .select("library_name,requires_paid_membership,membership_fee_amount,membership_fee_currency,stripe_account_id")
    .eq("id", libraryId)
    .maybeSingle();

  if (libErr || !lib) return NextResponse.json({ error: "Library not found" }, { status: 404 });
  if (!lib.requires_paid_membership) {
    return NextResponse.json({ error: "This library does not require payment" }, { status: 400 });
  }
  if (!lib.stripe_account_id) {
    return NextResponse.json({ error: "Library payment is not configured" }, { status: 400 });
  }
  if (!lib.membership_fee_amount || lib.membership_fee_amount <= 0) {
    return NextResponse.json({ error: "Membership fee is not set" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: (lib.membership_fee_currency ?? "NZD").toLowerCase(),
          unit_amount: lib.membership_fee_amount,
          product_data: {
            name: `${lib.library_name} membership`,
          },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      transfer_data: {
        destination: lib.stripe_account_id,
      },
    },
    metadata: {
      library_id: libraryId,
      membership_id: membership.id,
      user_id: user.id,
    },
    success_url: `${origin}/member/join/payment/complete?library_id=${encodeURIComponent(libraryId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/member/join/payment?library_id=${encodeURIComponent(libraryId)}&cancelled=1`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
