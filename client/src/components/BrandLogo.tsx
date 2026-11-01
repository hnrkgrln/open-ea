type BrandLogoSize = 'header' | 'splash';

export function BrandLogo({ size = 'header', label = '' }: { size?: BrandLogoSize; label?: string }) {
  return (
    <span className={`brand-logo brand-logo-${size}`} role={label ? 'img' : undefined} aria-label={label || undefined}>
      <img className="brand-logo-img brand-logo-light" src="/brand/logo-light.svg" alt="" />
      <img className="brand-logo-img brand-logo-dark" src="/brand/logo-dark.svg" alt="" />
    </span>
  );
}
