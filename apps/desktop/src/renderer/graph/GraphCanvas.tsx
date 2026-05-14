import { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import dagre from 'cytoscape-dagre';
import { useAppStore, type NoteInfo } from '../stores/app-store';
import { gmApi } from '../lib/api';

cytoscape.use(coseBilkent);
cytoscape.use(dagre);

interface GraphCanvasProps {
  notes: NoteInfo[];
  onNoteClick: (noteId: string) => void;
}

const VIRTUAL_RENDER_THRESHOLD = 500;

interface GraphData {
  nodes: Array<{ id: string; title: string; tags: string[] }>;
  edges: Array<{ id: string; source: string; target: string; type: string; weight: number }>;
}

export function GraphCanvas({ notes, onNoteClick }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const activeView = useAppStore((s) => s.activeView);
  const [graphData, setGraphData] = useState<GraphData | null>(null);

  useEffect(() => {
    if (!activeView) return;
    const graphApi = gmApi('graph');
    if (graphApi) {
      graphApi.call('query', {}).then((data) => {
        setGraphData(data as GraphData);
      }).catch((err) => {
        console.warn('Failed to load graph data from main process:', err);
      });
    }
  }, [activeView, notes]);

  useEffect(() => {
    if (!containerRef.current || !activeView) return;

    const elements: cytoscape.ElementDefinition[] = [];

    if (graphData && graphData.nodes.length > 0) {
      const shouldVirtualize = graphData.nodes.length > VIRTUAL_RENDER_THRESHOLD;
      const limitedNodes = shouldVirtualize ? graphData.nodes.slice(0, VIRTUAL_RENDER_THRESHOLD) : graphData.nodes;
      const nodeIds = new Set(limitedNodes.map((n) => n.id));

      for (const node of limitedNodes) {
        elements.push({
          data: { id: node.id, label: node.title || node.id, tags: node.tags },
        });
      }

      for (const edge of graphData.edges) {
        if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
          elements.push({
            data: { id: edge.id, source: edge.source, target: edge.target, type: edge.type, weight: edge.weight },
          });
        }
      }
    } else {
      const shouldVirtualize = notes.length > VIRTUAL_RENDER_THRESHOLD;
      const limitedNotes = shouldVirtualize ? notes.slice(0, VIRTUAL_RENDER_THRESHOLD) : notes;

      for (const note of limitedNotes) {
        elements.push({
          data: { id: note.id, label: note.title || note.id, tags: note.tags },
        });
      }

      const edgeSet = new Set<string>();
      for (const note of limitedNotes) {
        for (const tag of note.tags) {
          for (const other of limitedNotes) {
            if (other.id !== note.id && other.tags.includes(tag)) {
              const edgeId = `${note.id}-${other.id}-tag`;
              const reverseId = `${other.id}-${note.id}-tag`;
              if (!edgeSet.has(edgeId) && !edgeSet.has(reverseId)) {
                edgeSet.add(edgeId);
                elements.push({ data: { id: edgeId, source: note.id, target: other.id, type: 'tag' } });
              }
            }
          }
        }
      }
    }

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '10px',
            'color': 'var(--color-text-secondary)',
            'background-color': 'var(--color-primary-500)',
            'width': 24,
            'height': 24,
            'text-outline-color': 'var(--color-surface-base)',
            'text-outline-width': 2,
          },
        },
        {
          selector: 'node:active, node.highlighted',
          style: {
            'background-color': 'var(--color-primary-300)',
            'width': 32,
            'height': 32,
            'font-size': '12px',
            'font-weight': 'bold',
            'color': 'var(--color-text-primary)',
          },
        },
        {
          selector: 'node.hop1',
          style: {
            'background-color': 'var(--color-primary-400)',
            'width': 28,
            'height': 28,
            'color': 'var(--color-text-primary)',
          },
        },
        {
          selector: 'node.hop2',
          style: {
            'background-color': 'var(--color-primary-500)',
            'opacity': 0.7,
          },
        },
        {
          selector: 'node.dimmed',
          style: {
            'opacity': 0.2,
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': 'var(--color-border-subtle)',
            'opacity': 0.4,
            'curve-style': 'bezier',
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'width': 2,
            'line-color': 'var(--color-primary-400)',
            'opacity': 0.8,
          },
        },
      ],
      layout: {
        name: elements.length > VIRTUAL_RENDER_THRESHOLD ? 'dagre' : 'cose-bilkent',
        animate: elements.length <= VIRTUAL_RENDER_THRESHOLD,
        animationDuration: elements.length > VIRTUAL_RENDER_THRESHOLD ? 0 : 500,
        nodeRepulsion: 80000,
        idealEdgeLength: 100,
        gravity: 0.3,
        padding: 30,
        rankDir: 'TB',
      } as any,
    });

    cy.on('tap', 'node', (evt) => {
      const nodeId = evt.target.id();
      highlightNeighborhood(cy, nodeId, 2);
      onNoteClick(nodeId);
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass('highlighted hop1 hop2 dimmed');
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [notes, onNoteClick, activeView, graphData]);

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface-base)]">
      <div ref={containerRef} className="flex-1" />
      <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-1 text-xs text-[var(--color-text-disabled)]">
        <span>{notes.length} notes</span>
        <div className="flex gap-2">
          <button onClick={() => cyRef.current?.fit(undefined, 30)} className="hover:text-[var(--color-text-secondary)]">Fit</button>
          <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)} className="hover:text-[var(--color-text-secondary)]">+</button>
          <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() / 1.2)} className="hover:text-[var(--color-text-secondary)]">-</button>
        </div>
      </div>
    </div>
  );
}

function highlightNeighborhood(cy: cytoscape.Core, nodeId: string, maxHops: number) {
  cy.elements().removeClass('highlighted hop1 hop2 dimmed');
  cy.elements().addClass('dimmed');

  const visited = new Map<string, number>();
  const queue: [string, number][] = [[nodeId, 0]];

  while (queue.length > 0) {
    const [currentId, depth] = queue.shift()!;
    if (visited.has(currentId) || depth > maxHops) continue;
    visited.set(currentId, depth);

    const node = cy.$(`#${currentId}`);
    if (node.length === 0) continue;

    node.removeClass('dimmed');
    if (depth === 0) {
      node.addClass('highlighted');
    } else if (depth === 1) {
      node.addClass('hop1');
    } else {
      node.addClass('hop2');
    }

    const connectedEdges = node.connectedEdges();
    connectedEdges.forEach((edge) => {
      if (visited.get(edge.source().id()) !== undefined || visited.get(edge.target().id()) !== undefined) {
        edge.removeClass('dimmed');
        edge.addClass('highlighted');
      }
    });

    const neighbors = node.neighborhood('node');
    neighbors.forEach((neighbor) => {
      if (!visited.has(neighbor.id())) {
        queue.push([neighbor.id(), depth + 1]);
      }
    });
  }
}
