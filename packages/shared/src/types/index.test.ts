import { describe, it, expect } from 'vitest';
import { EdgeType } from '@graphmind/shared';

describe('GraphMind Shared Types', () => {
  it('should define all edge types', () => {
    const edgeTypes: EdgeType[] = ['link_ref', 'tag_cooccurrence', 'temporal_seq', 'semantic_sim'];
    expect(edgeTypes).toHaveLength(4);
    expect(edgeTypes).toContain('link_ref');
    expect(edgeTypes).toContain('tag_cooccurrence');
    expect(edgeTypes).toContain('temporal_seq');
    expect(edgeTypes).toContain('semantic_sim');
  });
});
