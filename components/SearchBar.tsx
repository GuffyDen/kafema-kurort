type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <label className="flex h-16 items-center gap-4 rounded-[var(--radius-xl)] border border-[#E8D9C8] bg-[var(--color-card)] px-5 shadow-[var(--shadow-soft)] transition duration-300 focus-within:border-[var(--color-caramel)]">
      <span className="relative h-5 w-5 rounded-full border-2 border-[var(--color-text-muted)] after:absolute after:-bottom-1 after:-right-1 after:h-2 after:w-2 after:rotate-45 after:rounded-full after:bg-[var(--color-text-muted)]">
        <span className="sr-only">Поиск</span>
      </span>
      <input
        type="search"
        placeholder="Поиск кофе, десертов или выпечки"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-base text-[var(--color-text-main)] outline-none placeholder:text-[var(--color-text-muted)]"
      />
    </label>
  );
}
