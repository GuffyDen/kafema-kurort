type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <label className="flex h-14 items-center gap-4 rounded-full border border-[#E9DDCF] bg-[#FFF9F0]/92 px-5 shadow-[0_12px_30px_rgba(64,39,23,0.06)] transition duration-500 focus-within:border-[#D9B890] focus-within:bg-white">
      <span className="relative h-5 w-5 rounded-full border-2 border-[#9A8471] after:absolute after:-bottom-1 after:-right-1 after:h-2 after:w-2 after:rotate-45 after:rounded-full after:bg-[#9A8471]">
        <span className="sr-only">Поиск</span>
      </span>
      <input
        type="search"
        placeholder="Найти кофе, десерт или выпечку"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-base text-[var(--color-text-main)] outline-none placeholder:text-[var(--color-text-muted)]"
      />
    </label>
  );
}
