import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, eyebrow, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-xs font-medium text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-balance sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({ title, description, action, children, className, bodyClassName }: { title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card text-card-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]", className)}>
      {title ? (
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={cn(title ? "px-5 pb-5" : "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
