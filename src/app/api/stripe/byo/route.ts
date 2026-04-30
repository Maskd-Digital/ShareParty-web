import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertLibraryOperator } from "@/lib/authz";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    libraryId: string;
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
  };

  if (!body.libraryId || !body.secretKey || !body.publishableKey || !body.webhookSecret) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    await assertLibraryOperator(supabase, user.id, body.libraryId);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 403;
    return NextResponse.json({ error: "Forbidden" }, { status });
  }

  // BYO Stripe mode is not represented in your pasted schema.
  return NextResponse.json({ error: "BYO Stripe not supported" }, { status: 400 });
}
