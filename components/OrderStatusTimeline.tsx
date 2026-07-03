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
    label: "Заказ принят",
    caption: "Передан бариста",
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
  const progressWidth = `${(activeIndex / (journeySteps.length - 1)) * 75}%`;

  return (
    <section className="rounded-[28px] bg-transparent">
      <div className="relative">
        <div className="absolute left-[12.5%] right-[12.5%] top-5 h-1 rounded-full bg-[#E4D8C9]" />
        <div
          className="absolute left-[12.5%] top-5 h-1 rounded-full bg-[var(--color-caramel)] transition-[width] duration-300"
          style={{ width: progressWidth }}
        />
        <div className="relative grid grid-cols-4">
          {journeySteps.map((step, index) => {
            const isDone = index <= activeIndex;

            return (
              <div className="flex h-10 items-center justify-center" key={step.id}>
                <span
                  className={`flex size-10 items-center justify-center rounded-full border transition duration-300 ${
                    isDone
                      ? "border-[var(--color-caramel)] bg-[#FFF3E2] text-[var(--color-caramel)] shadow-[0_10px_22px_rgba(189,134,73,0.24)]"
                      : "border-[#E4D8C9] bg-[#F4EADB] text-[var(--color-text-muted)]"
                  }`}
                >
                  <StepIcon id={step.id} />
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-4">
          {journeySteps.map((step, index) => {
            const isCurrent = index === activeIndex;

            return (
              <p
                className={`h-8 px-1 text-center text-xs font-bold leading-4 ${
                  isCurrent ? "text-[var(--color-caramel)]" : "text-[var(--color-text-main)]"
                }`}
                key={step.id}
              >
                {step.label}
              </p>
            );
          })}
        </div>

        <div className="mt-1 hidden grid-cols-4 min-[390px]:grid">
          {journeySteps.map((step) => (
            <p
              className="h-8 px-1 text-center text-[11px] font-semibold leading-tight text-[var(--color-text-muted)]"
              key={step.id}
            >
              {step.caption}
            </p>
          ))}
        </div>
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
