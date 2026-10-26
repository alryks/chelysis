import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "text";
  size?: "default" | "icon";
  selected?: boolean;
};

export function Button({
  variant = "secondary",
  size = "default",
  selected = false,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`button button--${variant} button--${size} ${className}`.trim()}
      data-selected={selected || undefined}
    />
  );
}
