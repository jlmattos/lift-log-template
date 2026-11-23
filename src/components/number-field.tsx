"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";

/**
 * Numeric entry field tuned for fast in-gym editing:
 *  - One tap selects the whole value, so you type to replace it (no manual
 *    delete / cursor-positioning).
 *  - If you clear it and tap away without entering anything, it reverts to the
 *    value it had when you focused (an accidental tap costs nothing).
 *
 * Controlled like a plain <Input>: pass `value` (string) and `onChange(next)`.
 */
export function NumberField({
  value,
  onChange,
  className,
  inputMode = "decimal",
  placeholder,
  min,
  max,
  step,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
}) {
  // Value captured at focus time, used to revert an accidental clear.
  const focusValue = useRef<string>("");

  return (
    <Input
      inputMode={inputMode}
      placeholder={placeholder}
      value={value}
      min={min}
      max={max}
      step={step}
      className={className}
      onFocus={(e) => {
        focusValue.current = value;
        const el = e.currentTarget;
        const selectAll = () => {
          try {
            el.setSelectionRange(0, el.value.length);
          } catch {
            /* some input types disallow selection — safe to ignore */
          }
        };
        // Select synchronously, and again next frame in case the underlying
        // input library re-places the caret after our handler runs. Whichever
        // sticks gives the user "tap → whole value selected, type to replace".
        selectAll();
        requestAnimationFrame(selectAll);
      }}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        // Left empty after an accidental tap → restore the prior value.
        if (value.trim() === "" && focusValue.current.trim() !== "") {
          onChange(focusValue.current);
        }
      }}
    />
  );
}
