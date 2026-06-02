import type { ReactNode } from "react";

export function CatalogPage({ children }: { children: ReactNode }) {
  return <div className="catalog-page">{children}</div>;
}

export function CatalogHero({
  title,
  description,
  stat,
}: {
  title: string;
  description?: string;
  stat?: string;
}) {
  return (
    <div className="catalog-hero">
      <div className="catalog-hero__text">
        <p className="catalog-hero__title">{title}</p>
        {description ? (
          <p className="catalog-hero__desc">{description}</p>
        ) : null}
      </div>
      {stat ? <span className="catalog-stat">{stat}</span> : null}
    </div>
  );
}

export function CatalogSteps({ children }: { children: ReactNode }) {
  return <div className="catalog-steps">{children}</div>;
}

export function CatalogStep({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="catalog-step">
      <header className="catalog-step__head">
        <span className="catalog-step__num">{step}</span>
        <h2 className="catalog-step__title">{title}</h2>
      </header>
      <div className="catalog-step__body">{children}</div>
    </article>
  );
}

export function CatalogBodyText({ children }: { children: ReactNode }) {
  return <p className="catalog-body-text">{children}</p>;
}

export function CatalogStepActions({ children }: { children: ReactNode }) {
  return <div className="catalog-step__actions">{children}</div>;
}

export function CatalogStack({
  children,
  loose,
}: {
  children: ReactNode;
  loose?: boolean;
}) {
  return (
    <div className={`catalog-stack${loose ? " catalog-stack--loose" : ""}`}>
      {children}
    </div>
  );
}

export function CatalogField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`catalog-field${className ? ` ${className}` : ""}`}>
      <span className="catalog-field__label">{label}</span>
      {children}
      {hint ? <span className="catalog-field__hint">{hint}</span> : null}
    </label>
  );
}

export function CatalogSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement>,
) {
  return <select className="catalog-select" {...props} />;
}

export function CatalogInput(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
  return <input className="catalog-input" {...props} />;
}

export function CatalogGrid({ children }: { children: ReactNode }) {
  return <div className="catalog-grid">{children}</div>;
}

export function CatalogChipRow({ children }: { children: ReactNode }) {
  return <div className="catalog-chip-row">{children}</div>;
}

export function CatalogChip({
  active,
  onClick,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`catalog-chip${active ? " catalog-chip--active" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function CatalogFiltersActive({ children }: { children: ReactNode }) {
  return <div className="catalog-filters-active">{children}</div>;
}

export function CatalogProgress({
  label,
  percent,
}: {
  label: string;
  percent: number;
}) {
  return (
    <div className="catalog-progress">
      <p className="catalog-progress__label">{label}</p>
      <div
        className="catalog-progress__track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="catalog-progress__fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function CatalogNote({ children }: { children: ReactNode }) {
  return <p className="catalog-note">{children}</p>;
}

export function CatalogBanner({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="catalog-banner">
      <p className="catalog-banner__title">{title}</p>
      <p className="catalog-banner__text">{text}</p>
      {children ? (
        <div className="catalog-banner__actions">{children}</div>
      ) : null}
    </div>
  );
}

export function CatalogUpload({
  label,
  hint,
  accept,
  disabled,
  onFile,
  fileName,
}: {
  label: string;
  hint?: string;
  accept: string;
  disabled?: boolean;
  onFile: (file: File | null) => void;
  fileName?: string;
}) {
  const id = "catalog-upload-input";

  return (
    <label
      className="catalog-upload"
      htmlFor={id}
      style={disabled ? { opacity: 0.6, pointerEvents: "none" } : undefined}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <p className="catalog-upload__title">{label}</p>
      {fileName || hint ? (
        <p className="catalog-upload__hint">{fileName ?? hint}</p>
      ) : null}
    </label>
  );
}

export function CatalogAsideBlock({ children }: { children: ReactNode }) {
  return <div className="catalog-aside-block">{children}</div>;
}

export function CatalogSectionBlock({ children }: { children: ReactNode }) {
  return <div className="catalog-section-block">{children}</div>;
}

export function CatalogColumnTags({ columns = [] }: { columns?: string[] }) {
  return (
    <div className="catalog-columns">
      {(columns ?? []).map((col) => (
        <span key={col} className="catalog-columns__tag">
          {col}
        </span>
      ))}
    </div>
  );
}
