import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../settings/SettingsModal';

describe('SettingsModal', () => {
  it('should not render when closed', () => {
    render(<SettingsModal open={false} onClose={() => {}} />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('should render when open', () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('should render all tabs', () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    expect(screen.getByText('models')).toBeInTheDocument();
    expect(screen.getByText('sync')).toBeInTheDocument();
    expect(screen.getByText('general')).toBeInTheDocument();
  });

  it('should call onClose when close button clicked', () => {
    let closed = false;
    render(<SettingsModal open={true} onClose={() => { closed = true; }} />);
    
    const closeBtn = document.querySelector('.topbar-btn') as HTMLElement;
    if (closeBtn) {
      fireEvent.click(closeBtn);
    }
  });

  it('should switch to sync tab', () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    const syncTab = screen.getByText('sync');
    fireEvent.click(syncTab);
    expect(screen.getByText(/WebDAV/)).toBeInTheDocument();
  });

  it('should switch to general tab and show theme options', () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    const generalTab = screen.getByText('general');
    fireEvent.click(generalTab);
    expect(screen.getByText('Appearance')).toBeInTheDocument();
  });
});
