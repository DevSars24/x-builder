import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactElement,
  ReactNode,
} from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> & {
  label: string;
  tooltip: string;
  icon: ReactNode;
  variant?: Extract<ButtonVariant, "ghost" | "secondary" | "danger">;
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?:
    | "neutral"
    | "accent"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "uncertain"
    | "usage-unused"
    | "usage-voice"
    | "usage-signal"
    | "usage-generation"
    | "usage-excluded";
  children: ReactNode;
};

export type TooltipProps = {
  label: string;
  children: ReactNode;
};

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  variant: "warning" | "danger";
  title: string;
  children: ReactNode;
  recovery?: ReactNode;
};

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  children: ReactNode;
  action?: ReactNode;
};

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  width: number;
  height: number;
};

export type PageHeaderProps = HTMLAttributes<HTMLElement> & {
  title: string;
  description?: string;
  backAction?: ReactNode;
  actions?: ReactNode;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Spinner(): ReactElement {
  return <span aria-hidden="true" className="xb-spinner" />;
}

export function Button({
  children,
  className,
  disabled,
  leadingIcon,
  loading = false,
  size = "md",
  trailingIcon,
  type = "button",
  variant = "secondary",
  ...buttonProps
}: ButtonProps): ReactElement {
  const ariaBusy = loading ? true : buttonProps["aria-busy"];

  return (
    <button
      className={cx(
        "xb-button",
        `xb-button--${variant}`,
        `xb-button--${size}`,
        loading && "xb-button--loading",
        className,
      )}
      disabled={disabled}
      type={type}
      {...buttonProps}
      aria-busy={ariaBusy}
    >
      {loading ? <Spinner /> : leadingIcon}
      <span className="xb-button__label">{children}</span>
      {trailingIcon}
    </button>
  );
}

export function IconButton({
  className,
  icon,
  label,
  tooltip,
  type = "button",
  variant = "ghost",
  ...buttonProps
}: IconButtonProps): ReactElement {
  return (
    <Tooltip label={tooltip}>
      <button
        aria-label={label}
        className={cx("xb-icon-button", `xb-icon-button--${variant}`, className)}
        type={type}
        {...buttonProps}
      >
        <span aria-hidden="true" className="xb-icon-button__icon">
          {icon}
        </span>
      </button>
    </Tooltip>
  );
}

export function Badge({
  children,
  className,
  variant = "neutral",
  ...badgeProps
}: BadgeProps): ReactElement {
  return (
    <span
      className={cx("xb-badge", `xb-badge--${variant}`, className)}
      {...badgeProps}
    >
      {children}
    </span>
  );
}

export function Tooltip({ children, label }: TooltipProps): ReactElement {
  return (
    <span className="xb-tooltip">
      {children}
      <span className="xb-tooltip__content" role="tooltip">
        {label}
      </span>
    </span>
  );
}

export function Alert({
  children,
  className,
  recovery,
  title,
  variant,
  ...alertProps
}: AlertProps): ReactElement {
  return (
    <div
      className={cx("xb-alert", `xb-alert--${variant}`, className)}
      role={variant === "danger" ? "alert" : "status"}
      {...alertProps}
    >
      <div className="xb-alert__content">
        <div className="xb-alert__title">{title}</div>
        <div className="xb-alert__message">{children}</div>
      </div>
      {recovery ? <div className="xb-alert__recovery">{recovery}</div> : null}
    </div>
  );
}

export function EmptyState({
  action,
  children,
  className,
  title,
  ...emptyStateProps
}: EmptyStateProps): ReactElement {
  return (
    <section className={cx("xb-empty-state", className)} {...emptyStateProps}>
      <h2 className="xb-empty-state__title">{title}</h2>
      <div className="xb-empty-state__body">{children}</div>
      {action ? <div className="xb-empty-state__action">{action}</div> : null}
    </section>
  );
}

export function Skeleton({
  className,
  height,
  label,
  style,
  width,
  ...skeletonProps
}: SkeletonProps): ReactElement {
  const skeletonStyle: CSSProperties = {
    width,
    height,
    ...style,
  };

  return (
    <div
      aria-label={label}
      className={cx("xb-skeleton", className)}
      role="status"
      style={skeletonStyle}
      {...skeletonProps}
    />
  );
}

export function ToastRegion(): ReactElement {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="xb-toast-region"
      role="status"
    />
  );
}

export function PageHeader({
  actions,
  backAction,
  className,
  description,
  title,
  ...headerProps
}: PageHeaderProps): ReactElement {
  return (
    <header className={cx("xb-page-header", className)} {...headerProps}>
      <div className="xb-page-header__main">
        {backAction ? (
          <div className="xb-page-header__back">{backAction}</div>
        ) : null}
        <div className="xb-page-header__copy">
          <h1 className="xb-page-header__title">{title}</h1>
          {description ? (
            <p className="xb-page-header__description">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="xb-page-header__actions">{actions}</div> : null}
    </header>
  );
}
