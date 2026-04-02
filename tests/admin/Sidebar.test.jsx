// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../../admin/src/components/Sidebar.jsx';

afterEach(() => {
  cleanup();
});

describe('admin Sidebar', () => {
  it('highlights active item and notifies selection', () => {
    const onSelect = vi.fn();
    const items = [
      { id: 'a', label: 'Alpha', description: 'Lab' },
      { id: 'b', label: 'Beta', description: 'Ops' },
    ];
    render(<Sidebar items={items} activeId="a" onSelect={onSelect} />);
    const active = document.querySelector('.admin-nav-item.is-active');
    expect(active?.textContent).toContain('Alpha');
    fireEvent.click(screen.getByRole('button', { name: /Beta/ }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });
});
