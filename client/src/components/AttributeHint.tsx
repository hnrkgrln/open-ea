export function AttributeHint({ text }: { text?: string | null }) {
  const value = text?.trim();
  if (!value) return null;
  return <p className="attribute-hint">{value}</p>;
}
