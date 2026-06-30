type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <label className="flex h-16 items-center gap-4 rounded-[24px] border border-[#EFEFEF] bg-[#FFFFFF] px-5 shadow-[0_14px_30px_rgba(119,119,119,0.12)] transition duration-300 focus-within:border-[#E30613]/35">
      <span className="relative h-5 w-5 rounded-full border-2 border-[#777777] after:absolute after:-bottom-1 after:-right-1 after:h-2 after:w-2 after:rotate-45 after:rounded-full after:bg-[#777777]">
        <span className="sr-only">Поиск</span>
      </span>
      <input
        type="search"
        placeholder="Поиск кофе, десертов или выпечки"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-base text-[#1A1A1A] outline-none placeholder:text-[#777777]"
      />
    </label>
  );
}
