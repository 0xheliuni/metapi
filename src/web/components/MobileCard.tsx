import React from 'react';

type MobileCardProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  headerActions?: React.ReactNode;
  footerActions?: React.ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  compact?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
};

type MobileFieldProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  stacked?: boolean;
};

export function MobileCard({
  title,
  subtitle,
  actions,
  headerActions,
  footerActions,
  selected = false,
  onSelect,
  compact = false,
  className = '',
  bodyClassName = '',
  children,
}: MobileCardProps) {
  const resolvedHeaderActions = headerActions ?? actions;
  const cardClassName = ['mobile-card', compact ? 'is-compact' : '', selected ? 'is-selected' : '', onSelect ? 'is-selectable' : '', className].filter(Boolean).join(' ');
  const cardBodyClassName = ['mobile-card-body', bodyClassName].filter(Boolean).join(' ');
  return (
    <div
      className={cardClassName}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      } : undefined}
      aria-pressed={onSelect ? selected : undefined}
    >
      <div className="mobile-card-header">
        <div className="mobile-card-title-block">
          <div className="mobile-card-title">{title}</div>
          {subtitle ? <div className="mobile-card-subtitle">{subtitle}</div> : null}
        </div>
        {resolvedHeaderActions ? <div className="mobile-card-header-actions">{resolvedHeaderActions}</div> : null}
      </div>
      <div className={cardBodyClassName}>{children}</div>
      {footerActions ? <div className="mobile-card-footer-actions">{footerActions}</div> : null}
    </div>
  );
}

export function MobileField({ label, value, stacked = false }: MobileFieldProps) {
  return (
    <div className={`mobile-field${stacked ? ' is-stacked' : ''}`}>
      <div className="mobile-field-label">{label}</div>
      <div className="mobile-field-value">{value}</div>
    </div>
  );
}
