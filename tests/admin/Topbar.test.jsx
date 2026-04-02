// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Topbar from '../../admin/src/components/Topbar.jsx';

afterEach(() => {
  cleanup();
});

describe('admin Topbar', () => {
  it('renders title and fires logout', () => {
    const onLogout = vi.fn();
    render(
      <Topbar
        title="Overview"
        subtitle="Ops"
        session={{ user: { email: 'ops@test.com' } }}
        onLogout={onLogout}
      />,
    );
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('ops@test.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /退出登录/ }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
