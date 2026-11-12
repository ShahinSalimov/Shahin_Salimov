"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { ArrowRight, Focus, Search, X } from "lucide-react";
import { ASSET_TYPE_META, HEALTH_META, RELATIONSHIP_INCOMING_LABEL, RELATIONSHIP_LABEL, RELATIONSHIP_STATUS_META } from "@/components/app/meta";
import { StatusPill } from "@/components/app/status-pill";
import { RelationshipReview } from "@/components/forms/relationship-review";
import { Button } from "@/components/ui/button";
import type { DependencyGraph as Graph, GraphEdge, GraphNode } from "@/domain/graph/build";
import { neighborhood } from "@/domain/graph/traverse";
import { ASSET_TYPES, type AssetType } from "@/domain/workspace/model";
import { percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddRelationshipDialog, RemoveRelationshipButton, SuggestButton } from "./graph-forms";
import { nodeTypes, type FlowNodeData } from "./nodes";

interface Props {
  graph: Graph;
  workspaceId: string;
  canEdit: boolean;
  assets: { id: string; name: string }[];
}

type Selection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;
const DEPTHS = [1, 2, 3, Infinity] as const;

export function DependencyGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvas({ graph, workspaceId, canEdit, assets }: Props) {
  const { resolvedTheme } = useTheme();
  const { fitView } = useReactFlow();
  const presentTypes = useMemo(() => ASSET_TYPES.filter((t) => graph.nodes.some((n) => n.assetType === t)), [graph]);
  const [types, setTypes] = useState<Set<AssetType>>(() => new Set(presentTypes));
  const [showInfo, setShowInfo] = useState(true);
  const [showSuggested, setShowSuggested] = useState(true);
  const [showRejected, setShowRejected] = useState(false);
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<number>(Infinity);
  const [selection, setSelection] = useState<Selection>(null);

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

  // ----- visibility -----
  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of graph.nodes) if (n.kind === "asset" && types.has(n.assetType!)) ids.add(n.id);
    if (showInfo) {
      for (const n of graph.nodes) if (n.kind === "information" && n.values?.some((v) => ids.has(`asset:${v.assetId}`))) ids.add(n.id);
      for (const e of graph.edges) if (e.kind === "attribute" && ids.has(e.target)) ids.add(e.source);
    }
    return ids;
  }, [graph, types, showInfo]);

  const visibleEdges = useMemo(
    () =>
      graph.edges.filter((e) => {
        if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) return false;
        if (e.kind !== "relationship") return true;
        if (e.status === "suggested") return showSuggested;
        if (e.status === "rejected") return showRejected;
        return true;
      }),
    [graph, visibleIds, showSuggested, showRejected],
  );

  // ----- highlight: selection neighborhood + search matches -----
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => new Set(q ? graph.nodes.filter((n) => visibleIds.has(n.id) && `${n.label} ${n.entity ?? ""} ${n.attribute ?? ""}`.toLowerCase().includes(q)).map((n) => n.id) : []), [graph, visibleIds, q]);
  const highlighted = useMemo(() => {
    if (selection?.kind === "node") return neighborhood(selection.id, visibleEdges, depth);
    if (selection?.kind === "edge") {
      const e = visibleEdges.find((x) => x.id === selection.id);
      return new Map(e ? [[e.source, 0], [e.target, 0]] : []);
    }
    return null;
  }, [selection, visibleEdges, depth]);

  const toFlowNode = useCallback(
    (n: GraphNode, prev?: Node): Node => {
      const data: FlowNodeData = {
        ...n,
        highlighted: Boolean(highlighted?.has(n.id)),
        dimmed: Boolean((highlighted && !highlighted.has(n.id)) || (q && !matches.has(n.id))),
        matched: matches.has(n.id),
        selected: selection?.kind === "node" && selection.id === n.id,
      };
      return { id: n.id, type: n.kind, position: prev?.position ?? { x: n.x, y: n.y }, data, draggable: true, ariaLabel: n.label };
    },
    [highlighted, matches, q, selection],
  );

  const columnNodes = useMemo<Node[]>(
    () =>
      graph.columns
        .filter((c) => (c.index > 1 || showInfo) && graph.nodes.some((n) => n.column === c.index && visibleIds.has(n.id)))
        .map((c) => ({ id: `col:${c.index}`, type: "column", position: { x: c.x, y: -56 }, data: { title: c.title }, draggable: false, selectable: false, focusable: false })),
    [graph, showInfo, visibleIds],
  );

  const computedNodes = useMemo<Node[]>(() => [...columnNodes, ...graph.nodes.filter((n) => visibleIds.has(n.id)).map((n) => toFlowNode(n))], [graph, visibleIds, toFlowNode, columnNodes]);
  // Initial nodes are passed on mount so `fitView` frames the whole graph; later updates keep dragged positions.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(computedNodes);
  useEffect(() => {
    setNodes((prev) => {
      const pos = new Map(prev.map((p) => [p.id, p.position]));
      return computedNodes.map((n) => (pos.has(n.id) && n.type !== "column" ? { ...n, position: pos.get(n.id)! } : n));
    });
  }, [computedNodes, setNodes]);

  const dark = resolvedTheme === "dark";
  const edges: Edge[] = useMemo(
    () =>
      visibleEdges.map((e) => {
        const active = highlighted ? highlighted.has(e.source) && highlighted.has(e.target) : !q;
        const isSelected = selection?.kind === "edge" && selection.id === e.id;
        return toFlowEdge(e, { active, isSelected, showLabel: isSelected || (selection?.kind === "node" && (selection.id === e.source || selection.id === e.target)), dark });
      }),
    [visibleEdges, highlighted, q, selection, dark],
  );

  const focusOn = (ids: string[]) => void fitView({ nodes: ids.map((id) => ({ id })), padding: 0.4, duration: 300, maxZoom: 1.2 });
  const selectedNode = selection?.kind === "node" ? byId.get(selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? graph.edges.find((e) => e.id === selection.id) : undefined;

  if (!graph.nodes.length) {
    return <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No assets yet. Register assets to see how they connect.</p>;
  }

  return (
    <div className="grid gap-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && matches.size && focusOn([...matches])}
              placeholder="Search assets, entities, attributes"
              aria-label="Search nodes"
              className="h-9 w-full rounded-lg border border-input bg-background pr-8 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          {q ? (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {matches.size} match{matches.size === 1 ? "" : "es"}
              {matches.size ? (
                <button type="button" className="ml-2 font-medium text-primary hover:underline" onClick={() => focusOn([...matches])}>
                  Show
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <>
              <SuggestButton workspaceId={workspaceId} />
              <AddRelationshipDialog workspaceId={workspaceId} assets={assets} defaultSource={selectedNode?.assetId} />
            </>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => fitView({ padding: 0.15, duration: 300 })}>
            <Focus />
            Fit
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <fieldset className="flex flex-wrap items-center gap-1">
          <legend className="sr-only">Asset types</legend>
          {presentTypes.map((t) => {
            const on = types.has(t);
            const Icon = ASSET_TYPE_META[t].icon;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTypes((prev) => { const next = new Set(prev); if (next.has(t)) next.delete(t); else next.add(t); return next; })}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-medium transition-colors", on ? "border-foreground/15 bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
              >
                <Icon className="size-3" aria-hidden="true" />
                {ASSET_TYPE_META[t].plural}
              </button>
            );
          })}
        </fieldset>
        <Toggle label="Information" checked={showInfo} onChange={setShowInfo} />
        <Toggle label="Suggested" checked={showSuggested} onChange={setShowSuggested} />
        <Toggle label="Rejected" checked={showRejected} onChange={setShowRejected} />
        <label className="flex items-center gap-1.5 text-muted-foreground">
          Highlight depth
          <select value={String(depth)} onChange={(e) => setDepth(Number(e.target.value))} className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground">
            {DEPTHS.map((d) => (
              <option key={d} value={String(d)}>
                {d === Infinity ? "All" : `${d} hop${d === 1 ? "" : "s"}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="h-[62vh] min-h-[420px] overflow-hidden rounded-xl border bg-card lg:h-[70vh]" role="application" aria-label="Dependency graph. Use the list view for a text alternative.">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={(_, n) => n.type !== "column" && setSelection({ kind: "node", id: n.id })}
            onEdgeClick={(_, e) => setSelection({ kind: "edge", id: e.id })}
            onPaneClick={() => setSelection(null)}
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.08, minZoom: 0.6 }}
            minZoom={0.1}
            maxZoom={2}
            onlyRenderVisibleElements
            colorMode={dark ? "dark" : "light"}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap pannable zoomable style={{ width: 150, height: 96 }} className="!hidden md:!block" nodeColor={(n) => (n.type === "information" ? ((n.data as unknown as FlowNodeData).consistent === false ? "#ef4444" : "#a5b4fc") : n.type === "entity" ? "#94a3b8" : "#6366f1")} />
          </ReactFlow>
        </div>

        <aside className="rounded-xl border bg-card p-4 text-sm lg:h-[70vh] lg:overflow-y-auto" aria-live="polite">
          {selectedNode ? (
            <NodeDetails node={selectedNode} graph={graph} byId={byId} workspaceId={workspaceId} canEdit={canEdit} onSelect={setSelection} onFocus={focusOn} highlighted={highlighted} depth={depth} />
          ) : selectedEdge ? (
            <EdgeDetails edge={selectedEdge} byId={byId} workspaceId={workspaceId} canEdit={canEdit} onDone={() => setSelection(null)} />
          ) : (
            <Legend />
          )}
        </aside>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-3.5 accent-[var(--primary)]" />
      {label}
    </label>
  );
}

function toFlowEdge(e: GraphEdge, o: { active: boolean; isSelected: boolean; showLabel: boolean; dark: boolean }): Edge {
  const muted = o.dark ? "#4b5563" : "#cbd5e1";
  if (e.kind === "relationship") {
    const color = e.status === "confirmed" ? (o.dark ? "#818cf8" : "#4f46e5") : e.status === "suggested" ? (o.dark ? "#38bdf8" : "#0284c7") : muted;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: "rel-out",
      targetHandle: "rel-in",
      type: "default",
      animated: e.status === "suggested" && o.isSelected,
      label: o.showLabel ? `${RELATIONSHIP_LABEL[e.type!]} · ${percent(e.confidence)}` : undefined,
      labelStyle: { fontSize: 11, fill: o.dark ? "#e5e7eb" : "#111827" },
      labelBgStyle: { fill: o.dark ? "#1f2937" : "#ffffff" },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      style: { stroke: color, strokeWidth: (o.isSelected ? 2 : 1) + e.confidence * 1.5, strokeDasharray: e.status === "suggested" ? "6 4" : e.status === "rejected" ? "2 4" : undefined, opacity: o.active ? 1 : 0.15 },
      ariaLabel: `${e.type} relationship, ${e.status}, confidence ${percent(e.confidence)}`,
    };
  }
  const color = e.mismatch ? "#ef4444" : muted;
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.kind === "occurrence" ? "occ-out" : "attr-out",
    targetHandle: e.kind === "occurrence" ? "occ-in" : "attr-in",
    type: "default",
    label: o.showLabel && e.label ? e.label : undefined,
    labelStyle: { fontSize: 10, fill: e.mismatch ? "#ef4444" : o.dark ? "#e5e7eb" : "#374151" },
    labelBgStyle: { fill: o.dark ? "#1f2937" : "#ffffff" },
    style: { stroke: color, strokeWidth: e.mismatch ? 1.5 : 1, opacity: o.active ? (e.kind === "attribute" ? 0.6 : 0.85) : 0.08 },
    selectable: false,
  };
}

function Legend() {
  return (
    <div className="grid gap-4">
      <div>
        <h2 className="font-semibold">How to read the map</h2>
        <p className="mt-1 text-xs text-muted-foreground">Select a node or a line for details. Sources are on the left; assets that depend on them are to the right.</p>
      </div>
      <ul className="grid gap-2.5 text-xs">
        <LegendRow swatch={<span className="h-0.5 w-8 bg-[#4f46e5]" />} text="Confirmed relationship (arrow points to the source it depends on)" />
        <LegendRow swatch={<span className="h-0 w-8 border-t-2 border-dashed border-[#0284c7]" />} text="Suggested relationship — needs review" />
        <LegendRow swatch={<span className="h-0 w-8 border-t-2 border-dotted border-muted-foreground/50" />} text="Rejected (hidden by default)" />
        <LegendRow swatch={<span className="h-px w-8 bg-muted-foreground/40" />} text="Information appears in this asset" />
        <LegendRow swatch={<span className="h-px w-8 bg-[#ef4444]" />} text="Value differs from the other assets" />
        <LegendRow swatch={<span className="h-1 w-8 rounded bg-[#4f46e5]" />} text="Thicker line = higher confidence" />
      </ul>
      <p className="border-t pt-3 text-xs text-muted-foreground">Every node and line comes from your data: assets, extracted facts and relationships. Nothing is drawn by hand.</p>
    </div>
  );
}

function LegendRow({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex w-8 shrink-0 items-center">{swatch}</span>
      <span className="text-muted-foreground">{text}</span>
    </li>
  );
}

function NodeDetails({
  node,
  graph,
  byId,
  workspaceId,
  canEdit,
  onSelect,
  onFocus,
  highlighted,
  depth,
}: {
  node: GraphNode;
  graph: Graph;
  byId: Map<string, GraphNode>;
  workspaceId: string;
  canEdit: boolean;
  onSelect: (s: Selection) => void;
  onFocus: (ids: string[]) => void;
  highlighted: Map<string, number> | null;
  depth: number;
}) {
  const reachable = highlighted ? [...highlighted.entries()].filter(([id, d]) => d > 0 && byId.get(id)?.kind === "asset") : [];
  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground capitalize">{node.kind === "information" ? "Shared information" : node.kind === "entity" ? "Business entity" : ASSET_TYPE_META[node.assetType!].label}</p>
        <h2 className="mt-0.5 font-semibold break-words">{node.label}</h2>
      </div>
      <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => onSelect(null)} aria-label="Close details">
        <X className="size-4" />
      </Button>
    </div>
  );

  if (node.kind === "information") {
    return (
      <div className="grid gap-3">
        {header}
        {node.consistent ? <p className="text-xs text-success">Same value in all {node.assetCount} assets.</p> : <p className="text-xs font-medium text-destructive">Values differ between assets — a likely inconsistency.</p>}
        <ul className="divide-y rounded-lg border">
          {node.values!.map((v) => (
            <li key={v.assetId} className="flex items-center gap-2 px-3 py-2">
              <button type="button" className="min-w-0 flex-1 truncate text-left text-xs hover:underline" onClick={() => onSelect({ kind: "node", id: `asset:${v.assetId}` })}>
                {v.assetName}
              </button>
              <span className={cn("shrink-0 text-xs font-medium", !v.matchesMajority && "text-destructive")}>{v.value}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (node.kind === "entity") {
    const infos = graph.edges.filter((e) => e.kind === "attribute" && e.source === node.id).map((e) => byId.get(e.target)!);
    return (
      <div className="grid gap-3">
        {header}
        <p className="text-xs text-muted-foreground">Shared attributes of this entity:</p>
        <ul className="grid gap-1">
          {infos.map((i) => (
            <li key={i.id}>
              <button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted" onClick={() => onSelect({ kind: "node", id: i.id })}>
                <span>{i.attribute}</span>
                <span className={cn("text-muted-foreground", i.consistent === false && "text-destructive")}>{i.consistent === false ? "differs" : `${i.assetCount} assets`}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const rels = graph.edges.filter((e) => e.kind === "relationship" && (e.source === node.id || e.target === node.id));
  const info = graph.edges.filter((e) => e.kind === "occurrence" && e.target === node.id).map((e) => byId.get(e.source)!);
  const health = node.health ? HEALTH_META[node.health] : null;
  return (
    <div className="grid gap-4">
      {header}
      <div className="flex flex-wrap items-center gap-2">
        {health ? <StatusPill meta={health} size="xs" /> : null}
        <span className="text-xs text-muted-foreground">
          {node.connected ? `Dependency level ${node.layer}` : "Not connected"} · {node.factsCount} facts
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={`/w/${workspaceId}/assets/${node.assetId}`}>Open asset</Link>
        </Button>
        {reachable.length ? (
          <Button size="sm" variant="ghost" onClick={() => onFocus([node.id, ...reachable.map(([id]) => id)])}>
            <Focus />
            Focus
          </Button>
        ) : null}
      </div>
      <section>
        <h3 className="text-xs font-semibold">Connected assets {depth === Infinity ? "" : `(within ${depth} hop${depth === 1 ? "" : "s"})`}</h3>
        {reachable.length ? (
          <ul className="mt-1.5 grid gap-1">
            {reachable
              .sort((a, b) => a[1] - b[1])
              .map(([id, d]) => (
                <li key={id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => onSelect({ kind: "node", id })}>
                    <span className="truncate">{byId.get(id)!.label}</span>
                    <span className="shrink-0 text-muted-foreground">{d} hop{d === 1 ? "" : "s"}</span>
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">No connected assets with the current filters.</p>
        )}
      </section>
      <section>
        <h3 className="text-xs font-semibold">Relationships ({rels.length})</h3>
        <ul className="mt-1.5 grid gap-2">
          {rels.map((e) => {
            const outgoing = e.source === node.id;
            const other = byId.get(outgoing ? e.target : e.source)!;
            return (
              <li key={e.id} className="rounded-lg border p-2.5">
                <button type="button" className="flex w-full items-center gap-1.5 text-left text-xs hover:underline" onClick={() => onSelect({ kind: "edge", id: e.id })}>
                  <span className="text-muted-foreground italic">{outgoing ? RELATIONSHIP_LABEL[e.type!] : RELATIONSHIP_INCOMING_LABEL[e.type!]}</span>
                  <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{other.label}</span>
                </button>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusPill meta={RELATIONSHIP_STATUS_META[e.status!]} size="xs" />
                  <span className="text-[11px] text-muted-foreground tabular">{percent(e.confidence)}</span>
                </div>
              </li>
            );
          })}
        </ul>
        {!rels.length ? <p className="mt-1 text-xs text-muted-foreground">None yet{canEdit ? " — use “Add relationship”." : "."}</p> : null}
      </section>
      {info.length ? (
        <section>
          <h3 className="text-xs font-semibold">Shared information in this asset</h3>
          <ul className="mt-1.5 grid gap-1">
            {info.map((i) => (
              <li key={i.id}>
                <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted" onClick={() => onSelect({ kind: "node", id: i.id })}>
                  <span className="truncate">{i.label}</span>
                  {i.consistent === false ? <span className="shrink-0 text-destructive">differs</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function EdgeDetails({ edge, byId, workspaceId, canEdit, onDone }: { edge: GraphEdge; byId: Map<string, GraphNode>; workspaceId: string; canEdit: boolean; onDone: () => void }) {
  const source = byId.get(edge.source)!;
  const target = byId.get(edge.target)!;
  const label = `${source.label} ${RELATIONSHIP_LABEL[edge.type!]} ${target.label}`;
  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Relationship</p>
          <h2 className="mt-0.5 font-semibold">{RELATIONSHIP_LABEL[edge.type!]}</h2>
        </div>
        <Button size="icon" variant="ghost" className="size-7" onClick={onDone} aria-label="Close details">
          <X className="size-4" />
        </Button>
      </div>
      <div className="grid gap-1.5 rounded-lg border p-3 text-xs">
        <span className="text-muted-foreground">Source (depends on target)</span>
        <span className="font-medium">{source.label}</span>
        <span className="text-muted-foreground italic">{RELATIONSHIP_LABEL[edge.type!]} ↓</span>
        <span className="font-medium">{target.label}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="mt-1">
            <StatusPill meta={RELATIONSHIP_STATUS_META[edge.status!]} size="xs" />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Confidence</dt>
          <dd className="mt-1 font-medium tabular">{percent(edge.confidence)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Origin</dt>
          <dd className="mt-1 capitalize">{edge.origin === "rule" ? "Rule-based suggestion" : edge.origin === "demo" ? "Sample data" : edge.origin}</dd>
        </div>
      </dl>
      {edge.note ? <p className="rounded-lg bg-muted/50 p-2.5 text-xs">{edge.note}</p> : null}
      {canEdit ? (
        <div className="grid gap-2 border-t pt-3">
          {edge.status === "suggested" ? <RelationshipReview workspaceId={workspaceId} relationshipId={edge.relationshipId!} label={label} /> : null}
          <RemoveRelationshipButton workspaceId={workspaceId} relationshipId={edge.relationshipId!} label={label} onDone={onDone} />
        </div>
      ) : null}
    </div>
  );
}
