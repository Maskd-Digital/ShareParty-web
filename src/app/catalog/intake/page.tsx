import { Suspense } from "react";
import { IntakePhotosScreen } from "./IntakePhotosScreen";

function PhotosFallback() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-sm text-forest-700">Loading…</div>
  );
}

export default function CatalogIntakePage() {
  return (
    <Suspense fallback={<PhotosFallback />}>
      <IntakePhotosScreen />
    </Suspense>
  );
}
