import type { ClientJourneyStatus } from "@/components/OrderStatusTimeline";

type LiveCupAnimationProps = {
  status: ClientJourneyStatus;
};

export function LiveCupAnimation({ status }: LiveCupAnimationProps) {
  const isCalm = status === "PAID" || status === "QUEUED";
  const isPreparing = status === "IN_PROGRESS";
  const isReady = status === "READY";

  return (
    <div
      className={`relative mx-auto flex h-72 w-full max-w-[320px] items-center justify-center overflow-hidden rounded-[34px] border transition duration-500 ${
        isReady
          ? "border-[#E9CDA9] bg-[#DDBF99]"
          : "border-[#E8D9C8] bg-[#F2E4D1]"
      } shadow-[0_28px_60px_rgba(73,52,36,0.12)]`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(255,255,255,0.58),transparent_28%),radial-gradient(circle_at_18%_78%,rgba(255,255,255,0.22),transparent_22%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.22)_0_1px,transparent_1px_11px)] opacity-45" />
      <div className="absolute left-6 top-8 h-28 w-20 rounded-full bg-[#A88768]/10 blur-2xl" />
      <div className="absolute -left-12 bottom-8 h-40 w-36 rotate-[-22deg] rounded-[70%_30%_70%_30%] bg-[#6E5A45]/10 blur-2xl" />
      <div className="absolute right-8 bottom-8 h-20 w-24 rounded-full bg-white/20 blur-2xl" />

      <div
        className={`absolute inset-x-8 top-8 h-24 rounded-full blur-3xl transition duration-500 ${
          isReady
            ? "bg-white/45"
            : isPreparing
              ? "bg-white/35"
              : "bg-white/24"
        }`}
      />

      <div className="relative flex flex-col items-center">
        <div className="relative h-20 w-32">
          {(isPreparing || isReady) ? (
            <>
              <SteamLine delay="0ms" left="left-8" ready={isReady} />
              <SteamLine delay="220ms" left="left-[3.75rem]" ready={isReady} />
              <SteamLine delay="440ms" left="left-[5.5rem]" ready={isReady} />
            </>
          ) : (
            <div className="absolute left-1/2 top-8 h-2 w-16 -translate-x-1/2 rounded-full bg-white/35" />
          )}
        </div>

        <div
          className={`relative h-[7.5rem] w-44 rounded-b-[58px] rounded-t-[30px] border transition duration-500 shadow-[inset_18px_0_28px_rgba(255,255,255,0.68),inset_-18px_-14px_28px_rgba(117,86,61,0.16),0_24px_38px_rgba(73,52,36,0.20)] ${
            isReady
              ? "border-white/75 bg-[linear-gradient(145deg,#FFF8ED_0%,#E8D5BD_100%)] text-[var(--color-caramel)]"
              : "border-[#DDBF99] bg-[linear-gradient(145deg,#FFFDF8_0%,#E8D5BD_100%)] text-[var(--color-caramel)]"
          } ${isPreparing ? "animate-[cup-breathe_1.8s_ease-in-out_infinite]" : ""}`}
        >
          <div className="absolute -top-1 left-4 right-4 h-8 rounded-full border border-[#D6A365]/55 bg-[linear-gradient(180deg,#FFF8ED_0%,#B98145_35%,#5A3822_100%)] shadow-[inset_0_3px_8px_rgba(255,255,255,0.36),0_2px_4px_rgba(87,55,33,0.12)]" />
          <div className="absolute left-7 right-7 top-2 h-4 rounded-full bg-[#5A3822]/70 blur-[1px]" />
          <div className="absolute inset-x-0 top-12 text-center text-5xl font-light text-[#BD8649] drop-shadow-[0_2px_4px_rgba(255,255,255,0.8)]">
            K
          </div>
          <div className="absolute left-5 top-4 h-20 w-9 rounded-full bg-white/35 blur-md" />
          <div className="absolute -right-12 top-7 h-[76px] w-[66px] rounded-full bg-[linear-gradient(145deg,#FFF8ED,#D9C0A2)] shadow-[inset_7px_5px_10px_rgba(255,255,255,0.55),inset_-7px_-6px_12px_rgba(87,55,33,0.14),0_10px_20px_rgba(73,52,36,0.12)]">
            <span className="absolute left-3 top-3 h-[52px] w-[42px] rounded-full bg-[#E0C9AC]" />
          </div>
        </div>

        <div
          className="mt-2 h-6 w-60 rounded-[999px] border border-white/55 bg-[linear-gradient(180deg,#FFF8ED,#D9C0A2)] shadow-[0_14px_26px_rgba(73,52,36,0.16),inset_0_2px_8px_rgba(255,255,255,0.55)]"
        />

        <p
          className={`mt-5 text-center text-sm font-bold ${
            isReady ? "text-white" : "text-[var(--color-text-muted)]"
          }`}
        >
          {isReady
                    ? "Ваш заказ ждет у стойки"
            : isPreparing
              ? "Бариста готовит заказ"
              : isCalm
                ? "Заказ спокойно ждет своей очереди"
                : ""}
        </p>
      </div>
    </div>
  );
}

function SteamLine({
  delay,
  left,
  ready,
}: {
  delay: string;
  left: string;
  ready: boolean;
}) {
  return (
    <span
      className={`absolute top-8 h-16 w-3 rounded-full ${
        ready ? "bg-white/75" : "bg-white/65"
      } animate-[steam-rise_1.9s_ease-in-out_infinite] ${left}`}
      style={{ animationDelay: delay }}
    />
  );
}
