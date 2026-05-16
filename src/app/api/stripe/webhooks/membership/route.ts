import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_MEMBERSHIP_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createAdminClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const membershipId = session.metadata?.membership_id;
    const libraryId = session.metadata?.library_id;

    if (!membershipId) {
      return NextResponse.json({ received: true });
    }

    const amount = session.amount_total ?? 0;
    const currency = (session.currency ?? "nzd").toUpperCase();
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

    await admin.from("membership_payments").insert({
      membership_id: membershipId,
      stripe_payment_intent_id: paymentIntentId,
      amount,
      currency,
      status: "succeeded",
    });

    await admin.from("memberships").update({ payment_status: "paid" }).eq("id", membershipId);
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const membershipId = session.metadata?.membership_id;
    if (membershipId) {
      await admin.from("memberships").update({ payment_status: "failed" }).eq("id", membershipId).eq("payment_status", "pending");
    }
  }

  return NextResponse.json({ received: true });
}
