import { APP_NAME, APP_SHORT_NAME } from "../config/appMode";
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
      {short ? APP_SHORT_NAME : APP_NAME}
    </span>
  );
}