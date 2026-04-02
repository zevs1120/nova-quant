// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import StatCard from '../../admin/src/components/StatCard.jsx';

afterEach(() => {
  cleanup();
});

describe('admin StatCard', () => {
  it('renders label value and detail', () => {
    render(<StatCard label="Users" value="42" detail="active" tone="positive" />);
    expect(screen.getByText('Users')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
    expect(document.querySelector('.stat-card')?.className).toContain('tone-positive');
  });
});
