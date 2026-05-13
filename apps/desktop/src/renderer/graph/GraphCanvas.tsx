import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import dagre from 'cytoscape-dagre';
import { useAppStore, type NoteInfo } from '../stores/app-store';

cytoscape.use(coseBilkent);
cytoscape.use(dagre);

interface GraphCanvasProps {
  notes: NoteInfo[];
  onNoteClick: (noteId: string) => void;
}

const VIRTUAL_RENDER_THRESHOLD = 500;

export function GraphCanvas({ notes, onNoteClick }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const activeView = useAppStore((s) => s.activeView);

  useEffect(() => {
    if (!containerRef.current || !activeView) return;

    const elements: cytoscape.ElementDefinition[] = [];

    const nodeCount = notes.length;
    const shouldVirtualize = nodeCount > VIRTUAL_RENDER_THRESHOLD;
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
        name: shouldVirtualize ? 'dagre' : 'cose-bilkent',
        animate: !shouldVirtualize,
        animationDuration: shouldVirtualize ? 0 : 500,
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

    if (shouldVirtualize) {
      console.warn(`Graph virtualization: showing ${VIRTUAL_RENDER_THRESHOLD} of ${nodeCount} nodes`);
    }

    return () => {
      cy.destroy();
    };
  }, [notes, onNoteClick, activeView]);

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
