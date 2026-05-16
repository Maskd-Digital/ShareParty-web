import { redirect } from "next/navigation";
import { loadMemberContext } from "@/lib/memberContext";

export async function requireMemberAuth(): Promise<NonNullable<Awaited<ReturnType<typeof loadMemberContext>>>> {
  const ctx = await loadMemberContext();
  if (!ctx) redirect("/login");
  if (ctx.role === "operator") redirect("/dashboard");
  return ctx;
}

export async function requireCatalogAccess(libraryId?: string) {
  const ctx = await requireMemberAuth();

  if (ctx.paymentRequiredLibrary && (!libraryId || libraryId === ctx.paymentRequiredLibrary.libraryId)) {
    redirect(`/member/join/payment?library_id=${encodeURIComponent(ctx.paymentRequiredLibrary.libraryId)}`);
  }

  const libId = libraryId ?? ctx.activeLibrary?.libraryId;
  if (!libId || !ctx.activeLibrary || ctx.activeLibrary.libraryId !== libId) {
    redirect("/dashboard");
  }

  return { ctx, libraryId: libId };
}
