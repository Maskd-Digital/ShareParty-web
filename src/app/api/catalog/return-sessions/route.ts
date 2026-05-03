import { NextResponse } from "next/server";
import { startReturnInspection } from "@/lib/server/returnInspectionStart";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/catalog/return-sessions
 * Member starts a return inspection for an item they have on active loan.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { item_id?: string };
  try {
    body = (await request.json()) as { item_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const itemId = body.item_id?.trim();
  if (!itemId) return NextResponse.json({ error: "item_id required" }, { status: 400 });

  const result = await startReturnInspection(supabase, user.id, itemId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ sessionId: result.sessionId, existing: result.existing });
}
