const beans = [
  "left-2 top-10 h-11 w-7 rotate-[34deg] opacity-70 blur-[1px]",
  "right-4 top-8 h-9 w-6 rotate-[-28deg] opacity-65",
  "left-6 top-[22rem] h-8 w-5 rotate-[-22deg] opacity-55",
  "right-1 top-[15rem] h-12 w-7 rotate-[29deg] opacity-70 blur-[0.5px]",
  "left-1/2 top-[4.5rem] h-6 w-4 rotate-[16deg] opacity-25 blur-[2px]",
  "left-4 bottom-40 h-10 w-6 rotate-[-34deg] opacity-60",
  "right-6 bottom-32 h-8 w-5 rotate-[22deg] opacity-45 blur-[1px]",
  "left-10 bottom-8 h-7 w-5 rotate-[18deg] opacity-35 blur-[2px]",
  "right-2 bottom-6 h-12 w-7 rotate-[-18deg] opacity-70",
  "right-[18%] top-[31rem] h-6 w-4 rotate-[42deg] opacity-30 blur-[1.5px]",
];

type BackgroundDecorProps = {
  className?: string;
};

export function BackgroundDecor({ className = "" }: BackgroundDecorProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 select-none overflow-hidden ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(255,255,255,0.78),transparent_28%),radial-gradient(circle_at_85%_38%,rgba(218,181,137,0.14),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.22)_0_1px,transparent_1px_9px)] opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(80,56,37,0.035)_0_1px,transparent_1px_7px),radial-gradient(circle_at_70%_62%,rgba(255,255,255,0.42)_0_1px,transparent_1px_8px)] opacity-55" />

      <LeafShadow className="-left-24 top-6 h-96 w-80 rotate-[-22deg] opacity-[0.08]" />
      <LeafShadow className="right-[-5rem] top-36 h-80 w-72 rotate-[18deg] opacity-[0.065]" />
      <LeafShadow className="-right-16 bottom-[-3rem] h-[28rem] w-80 rotate-[28deg] opacity-[0.08]" />
      <LeafShadow className="-left-24 bottom-16 h-72 w-64 rotate-[38deg] opacity-[0.055]" />
      <LeafCluster className="-left-14 top-40 h-72 w-56 rotate-[-26deg] opacity-[0.08]" />
      <LeafCluster className="right-[-3rem] top-[18rem] h-80 w-56 rotate-[24deg] opacity-[0.075]" />
      <LeafCluster className="-right-10 bottom-20 h-72 w-56 rotate-[34deg] opacity-[0.08]" />

      {beans.map((beanClassName, index) => (
        <CoffeeBean className={beanClassName} key={`${beanClassName}-${index}`} />
      ))}
    </div>
  );
}

function LeafCluster({ className }: { className: string }) {
  return (
    <div
      className={`absolute blur-[8px] ${className}`}
      style={{
        background:
          "radial-gradient(ellipse at 50% 10%, #6E5A45 0 15%, transparent 16%), radial-gradient(ellipse at 28% 28%, #6E5A45 0 16%, transparent 17%), radial-gradient(ellipse at 72% 30%, #6E5A45 0 16%, transparent 17%), radial-gradient(ellipse at 24% 55%, #6E5A45 0 15%, transparent 16%), radial-gradient(ellipse at 76% 58%, #6E5A45 0 15%, transparent 16%), linear-gradient(90deg, transparent 49%, #6E5A45 49% 51%, transparent 51%)",
      }}
    />
  );
}

function LeafShadow({ className }: { className: string }) {
  return (
    <div className={`absolute ${className}`}>
      <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rounded-full bg-[#6E5A45] blur-[10px]" />
      {[-34, -20, -8, 8, 20, 34].map((angle, index) => (
        <span
          className="absolute left-1/2 top-1/2 h-28 w-20 origin-bottom rounded-[80%_20%_80%_20%] bg-[#6E5A45] blur-[18px]"
          key={angle}
          style={{
            transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(${index % 2 ? "-54px" : "-22px"})`,
          }}
        />
      ))}
    </div>
  );
}

function CoffeeBean({ className }: { className: string }) {
  return (
    <span
      className={`absolute rounded-[999px] bg-[linear-gradient(135deg,#8B6346_0%,#D7B08A_45%,#5A3825_100%)] shadow-[0_10px_22px_rgba(73,52,36,0.18),inset_5px_5px_8px_rgba(255,255,255,0.28),inset_-4px_-5px_8px_rgba(58,35,22,0.28)] ${className}`}
    >
      <span className="absolute left-1/2 top-1/2 h-[76%] w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-[16deg] rounded-full bg-[#4D2F20]/30 shadow-[1px_0_2px_rgba(255,255,255,0.35)]" />
    </span>
  );
}
