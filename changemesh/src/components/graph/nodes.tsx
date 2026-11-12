"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, CircleDot, Layers } from "lucide-react";
import { ASSET_TYPE_META, HEALTH_META } from "@/components/app/meta";
import { toneClass } from "@/components/app/status-pill";
import type { GraphNode } from "@/domain/graph/build";
import { cn } from "@/lib/utils";

export type FlowNodeData = GraphNode & { dimmed: boolean; highlighted: boolean; matched: boolean; selected: boolean } & Record<string, unknown>;
export type AssetFlowNode = Node<FlowNodeData, "asset">;
export type InfoFlowNode = Node<FlowNodeData, "information">;
export type EntityFlowNode = Node<FlowNodeData, "entity">;
export type ColumnFlowNode = Node<{ title: string }, "column">;

const handle = "!size-1.5 !min-w-0 !min-h-0 !border-0 !bg-muted-foreground/40";

function frame(d: FlowNodeData) {
  return cn(
    "rounded-xl border bg-card text-card-foreground shadow-sm transition-[opacity,box-shadow,border-color] duration-150",
    d.dimmed && "opacity-25",
    d.highlighted && "border-primary/50 shadow-md",
    d.matched && "ring-2 ring-warning/70",
    d.selected && "ring-2 ring-primary",
  );
}

export function AssetNode({ data }: NodeProps<AssetFlowNode>) {
  const meta = ASSET_TYPE_META[data.assetType!];
  const Icon = meta.icon;
  const health = data.health ? HEALTH_META[data.health] : null;
  return (
    <div className={cn(frame(data), "w-[220px] px-3 py-2.5")} aria-label={`Asset ${data.label}, ${meta.label}${health ? `, ${health.label}` : ""}`}>
      <Handle type="source" id="rel-out" position={Position.Left} className={handle} />
      <Handle type="target" id="rel-in" position={Position.Right} className={handle} />
      <Handle type="target" id="occ-in" position={Position.Left} className={cn(handle, "!top-[70%]")} />
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-tight font-semibold" title={data.label}>
            {data.label}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta.label}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
        {health ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-px font-medium ring-1 ring-inset", toneClass(health.tone))}>
            <health.icon className="size-2.5" aria-hidden="true" />
            {health.label}
          </span>
        ) : (
          <span />
        )}
        <span className="text-muted-foreground tabular">
          {data.factsCount ?? 0} facts · {data.degree} links
        </span>
      </div>
    </div>
  );
}

export function InformationNode({ data }: NodeProps<InfoFlowNode>) {
  const inconsistent = data.consistent === false;
  return (
    <div
      className={cn(frame(data), "w-[200px] px-3 py-2", inconsistent ? "border-destructive/40 bg-destructive/[0.04]" : "border-dashed")}
      aria-label={`Shared information ${data.label}, in ${data.assetCount} assets${inconsistent ? ", values differ" : ""}`}
    >
      <Handle type="target" id="attr-in" position={Position.Left} className={handle} />
      <Handle type="source" id="occ-out" position={Position.Right} className={handle} />
      <div className="flex items-center gap-1.5">
        {inconsistent ? <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" /> : <CircleDot className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
        <p className="truncate text-[12px] font-semibold" title={data.label}>
          {data.attribute}
        </p>
        <span className="ml-auto text-[10px] text-muted-foreground tabular">{data.assetCount}×</span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={data.entity}>
        {data.entity}
      </p>
      {inconsistent ? <p className="mt-1 text-[10px] font-medium text-destructive">Values differ</p> : null}
    </div>
  );
}

export function EntityNode({ data }: NodeProps<EntityFlowNode>) {
  return (
    <div className={cn(frame(data), "flex w-[180px] items-center gap-2 rounded-full px-3 py-1.5")} aria-label={`Entity ${data.label}`}>
      <Handle type="source" id="attr-out" position={Position.Right} className={handle} />
      <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="truncate text-[12px] font-medium" title={data.label}>
        {data.label}
      </p>
    </div>
  );
}

export function ColumnNode({ data }: NodeProps<ColumnFlowNode>) {
  return <div className="pointer-events-none text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase">{data.title}</div>;
}

export const nodeTypes = { asset: AssetNode, information: InformationNode, entity: EntityNode, column: ColumnNode };
