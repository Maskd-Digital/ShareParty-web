import { NextResponse } from "next/server";
import { startReturnInspection } from "@/lib/server/returnInspectionStart";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const itemId = url.searchParams.get("item")?.trim();
  const back = new URL("/returns", url.origin);

  if (!itemId) return NextResponse.redirect(back);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));

  const result = await startReturnInspection(supabase, user.id, itemId);
  if (!result.ok) {
    const q = new URLSearchParams({ err: result.error });
    return NextResponse.redirect(new URL(`/returns?${q}`, url.origin));
  }

  return NextResponse.redirect(new URL(`/returns/photos/${encodeURIComponent(result.sessionId)}`, url.origin));
}
