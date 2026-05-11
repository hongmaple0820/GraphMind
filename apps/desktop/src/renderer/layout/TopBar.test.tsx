import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopBar } from '../layout/TopBar';

describe('TopBar', () => {
  it('should render GraphMind title', () => {
    render(<TopBar />);
    expect(screen.getByText('GraphMind')).toBeInTheDocument();
  });

  it('should render Editor and Graph view buttons', () => {
    render(<TopBar />);
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByText('Graph')).toBeInTheDocument();
  });

  it('should call onOpenSettings when settings button clicked', () => {
    let called = false;
    render(<TopBar onOpenSettings={() => { called = true; }} />);
    
    const settingsBtn = screen.getByTitle('Settings (Ctrl+,)');
    fireEvent.click(settingsBtn);
    expect(called).toBe(true);
  });

  it('should show indexing status', () => {
    render(<TopBar isIndexing={true} />);
    expect(screen.getByText('Indexing...')).toBeInTheDocument();
  });
});
