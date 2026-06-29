import Image from "next/image";

export function Header() {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex h-[76px] w-[236px] items-center justify-center overflow-hidden rounded-[24px] bg-[#E30613] px-3 py-2 shadow-[0_18px_36px_rgba(227,6,19,0.18)]">
        <Image
          src="/kafema-kurort-logo.png"
          alt="Кафема Курорт"
          width={1913}
          height={822}
          priority
          unoptimized
          className="h-full w-auto object-contain"
        />
      </div>

      <button
        type="button"
        className="flex h-12 w-12 items-center justify-center rounded-full border border-[#EFEFEF] bg-[#FFFFFF] text-[#1A1A1A] shadow-[0_10px_24px_rgba(119,119,119,0.14)] transition duration-300 hover:border-[#E30613]/30 active:scale-95"
        aria-label="Открыть профиль"
      >
        <span className="h-5 w-5 rounded-full border-2 border-[#1A1A1A] before:mx-auto before:mt-[18px] before:block before:h-3 before:w-7 before:-translate-x-1 before:rounded-t-full before:border-2 before:border-b-0 before:border-[#1A1A1A] before:content-['']" />
      </button>
    </header>
  );
}
