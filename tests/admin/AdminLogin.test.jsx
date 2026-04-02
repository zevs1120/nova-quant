// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminLogin from '../../admin/src/components/AdminLogin.jsx';

afterEach(() => {
  cleanup();
});

describe('admin AdminLogin', () => {
  it('submits email and password', () => {
    const onSubmit = vi.fn();
    render(<AdminLogin loading={false} error="" onSubmit={onSubmit} apiBase="https://api.test" />);
    fireEvent.change(screen.getByPlaceholderText('you@novaquant.cloud'), {
      target: { value: 'a@b.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /管理员登录/ }));
    expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret' });
    expect(screen.getByText(/api\.test/)).toBeTruthy();
  });

  it('disables submit while loading', () => {
    render(<AdminLogin loading error="" onSubmit={vi.fn()} apiBase="" />);
    expect(screen.getByRole('button', { name: /正在校验权限/ }).disabled).toBe(true);
  });
});
