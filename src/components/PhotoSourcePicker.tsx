"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PhotoSourcePickerProps = {
  onFile: (file: File) => void;
  disabled?: boolean;
  uploading?: boolean;
  buttonLabel?: string;
  uploadingLabel?: string;
  /** Narrower trigger for tight layouts */
  size?: "default" | "compact";
};

/**
 * Opens a small menu: gallery (file picker) vs camera (`capture` — mobile camera where supported).
 */
export function PhotoSourcePicker({
  onFile,
  disabled = false,
  uploading = false,
  buttonLabel = "Add photo",
  uploadingLabel = "Uploading…",
  size = "default",
}: PhotoSourcePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      onFile(f);
      setOpen(false);
    },
    [onFile],
  );

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (ev: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerClass =
    size === "compact"
      ? "btn-secondary px-3 py-1.5 text-sm"
      : "btn-secondary";

  return (
    <div ref={wrapRef} className="relative inline-block text-left">
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
        disabled={disabled || uploading}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
        disabled={disabled || uploading}
      />
      <button
        type="button"
        className={triggerClass}
        disabled={disabled || uploading}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {uploading ? uploadingLabel : buttonLabel}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+0.35rem)] z-50 min-w-[11.5rem] overflow-hidden rounded-xl border border-cream-300/90 bg-cream-50 py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left text-sm font-medium text-forest-900 hover:bg-cream-200/70"
            onClick={(e) => {
              e.stopPropagation();
              galleryRef.current?.click();
              setOpen(false);
            }}
          >
            Choose from gallery
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left text-sm font-medium text-forest-900 hover:bg-cream-200/70"
            onClick={(e) => {
              e.stopPropagation();
              cameraRef.current?.click();
              setOpen(false);
            }}
          >
            Take photo
          </button>
        </div>
      ) : null}
    </div>
  );
}
