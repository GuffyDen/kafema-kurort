export type ClientJourneyStatus = "PAID" | "QUEUED" | "IN_PROGRESS" | "READY";

type OrderStatusTimelineProps = {
  status: ClientJourneyStatus;
};

const journeySteps: Array<{
  id: ClientJourneyStatus;
  label: string;
  caption: string;
}> = [
  {
    id: "PAID",
    label: "Оплачен",
    caption: "ЮKassa mock",
  },
  {
    id: "QUEUED",
    label: "В очереди",
    caption: "Бариста видит заказ",
  },
  {
    id: "IN_PROGRESS",
    label: "Готовится",
    caption: "Заказ в работе",
  },
  {
    id: "READY",
    label: "Готово",
    caption: "Можно забирать",
  },
];

const statusOrder: Record<ClientJourneyStatus, number> = {
  PAID: 0,
  QUEUED: 1,
  IN_PROGRESS: 2,
  READY: 3,
};

export function OrderStatusTimeline({ status }: OrderStatusTimelineProps) {
  const activeIndex = statusOrder[status];

  return (
    <section className="rounded-[28px] bg-transparent">
      <div className="flex items-center justify-between gap-2">
        {journeySteps.map((step, index) => {
          const isDone = index <= activeIndex;
          const isCurrent = index === activeIndex;

          return (
            <div
              className="flex min-w-0 flex-1 flex-col items-center text-center"
              key={step.id}
            >
              <div className="flex w-full items-center">
                <div
                  className={`h-1 flex-1 rounded-full ${
                    index === 0
                      ? "bg-transparent"
                      : index <= activeIndex
                        ? "bg-[var(--color-caramel)]"
                        : "bg-[#E4D8C9]"
                  }`}
                />
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full border transition duration-300 ${
                    isDone
                      ? "border-[var(--color-caramel)] bg-[#FFF3E2] text-[var(--color-caramel)] shadow-[0_10px_22px_rgba(189,134,73,0.24)]"
                      : "border-[#E4D8C9] bg-[#F4EADB] text-[var(--color-text-muted)]"
                  }`}
                >
                  <StepIcon id={step.id} />
                </span>
                <div
                  className={`h-1 flex-1 rounded-full ${
                    index === journeySteps.length - 1
                      ? "bg-transparent"
                      : index < activeIndex
                        ? "bg-[var(--color-caramel)]"
                        : "bg-[#E4D8C9]"
                  }`}
                />
              </div>

              <p
                className={`mt-3 truncate text-xs font-bold ${
                  isCurrent ? "text-[var(--color-caramel)]" : "text-[var(--color-text-main)]"
                }`}
              >
                {step.label}
              </p>
              <p className="mt-1 hidden text-[11px] font-semibold leading-tight text-[var(--color-text-muted)] min-[390px]:block">
                {step.caption}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StepIcon({ id }: { id: ClientJourneyStatus }) {
  if (id === "PAID") {
    return (
      <span className="relative h-4 w-5 rounded-[4px] border-2 border-current">
        <span className="absolute left-1 right-1 top-1 h-[2px] rounded-full bg-current opacity-65" />
        <span className="absolute bottom-1 left-1 h-[2px] w-2 rounded-full bg-current opacity-65" />
      </span>
    );
  }

  if (id === "QUEUED") {
    return (
      <span className="relative h-5 w-4 rounded-b-[5px] rounded-t-[2px] border-2 border-current">
        <span className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-current border-b-transparent" />
        <span className="absolute left-1 right-1 top-2 h-[2px] rounded-full bg-current opacity-65" />
      </span>
    );
  }

  if (id === "IN_PROGRESS") {
    return (
      <span className="relative h-5 w-5">
        <span className="absolute bottom-0 left-1 h-3 w-3 rounded-b-[7px] rounded-t-[3px] border-2 border-current" />
        <span className="absolute bottom-1 right-0 h-2 w-2 rounded-r-full border-2 border-current border-l-0" />
        <span className="absolute left-2 top-0 h-2 w-[2px] rounded-full bg-current opacity-50" />
        <span className="absolute left-4 top-1 h-2 w-[2px] rounded-full bg-current opacity-35" />
      </span>
    );
  }

  return (
    <span className="relative h-5 w-4 rounded-[4px] border-2 border-current">
      <span className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-current border-b-transparent" />
      <span className="absolute left-1 top-2 h-2 w-3 rotate-[-45deg] border-b-2 border-l-2 border-current" />
    </span>
  );
}
