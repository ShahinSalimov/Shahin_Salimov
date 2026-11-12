"use client";

import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export interface ImpactGraphNode {
  id: string;
  label: string;
  level: "source" | "critical" | "high" | "medium" | "low" | "connector";
  column: number;
  row: number;
}
export interface ImpactGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

const LEVEL_CLASS: Record<ImpactGraphNode["level"], string> = {
  source: "border-primary bg-primary/10 font-semibold",
  critical: "border-level-critical bg-level-critical/10",
  high: "border-level-high bg-level-high/10",
  medium: "border-level-medium bg-level-medium/15",
  low: "border-level-low bg-level-low/10",
  connector: "border-dashed bg-muted/50 text-muted-foreground",
};

type ImpactNode = Node<{ label: string; level: ImpactGraphNode["level"] }, "impact">;

function ImpactNodeView({ data }: NodeProps<ImpactNode>) {
  return (
    <div className={cn("w-[180px] rounded-lg border-2 px-2.5 py-1.5 text-[11px] leading-tight shadow-sm", LEVEL_CLASS[data.level])} title={data.label}>
      <Handle type="target" position={Position.Left} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <Handle type="source" position={Position.Right} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
      <p className="truncate">{data.label}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground capitalize">{data.level === "connector" ? "on the path" : data.level}</p>
    </div>
  );
}

/** Source on the left, affected assets along their relationship paths to the right. */
export function ImpactGraph({ nodes, edges }: { nodes: ImpactGraphNode[]; edges: ImpactGraphEdge[] }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const flowNodes: Node[] = nodes.map((n) => ({ id: n.id, type: "impact", position: { x: n.column * 240, y: n.row * 64 }, data: { label: n.label, level: n.level }, draggable: true }));
  const flowEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    labelStyle: { fontSize: 10, fill: dark ? "#d1d5db" : "#4b5563" },
    labelBgStyle: { fill: dark ? "#1f2937" : "#ffffff" },
    style: { stroke: dark ? "#6b7280" : "#94a3b8" },
    markerEnd: { type: MarkerType.ArrowClosed, color: dark ? "#6b7280" : "#94a3b8" },
  }));
  return (
    <div className="h-[340px] overflow-hidden rounded-lg border bg-background" role="img" aria-label={`Impact graph: ${nodes.filter((n) => n.level !== "source" && n.level !== "connector").length} affected assets. The list below has the same information as text.`}>
      <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={{ impact: ImpactNodeView }} fitView fitViewOptions={{ padding: 0.15, minZoom: 0.5 }} nodesConnectable={false} colorMode={dark ? "dark" : "light"} proOptions={{ hideAttribution: true }} minZoom={0.2}>
        <Background gap={20} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  );
}
