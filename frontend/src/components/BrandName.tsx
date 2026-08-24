import type { HTMLAttributes } from "react";

interface BrandNameProps
  extends HTMLAttributes<HTMLSpanElement> {
  short?: boolean;
}

export default function BrandName({
  short = false,
  ...props
}: BrandNameProps) {
  return (
    <span
      translate="no"
      className="notranslate"
      {...props}
    >
      {short ? "DentalPos" : "DentalPos One"}
    </span>
  );
}