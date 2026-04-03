import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import KpiCard from '../../src/components/KpiCard';

describe('KpiCard Component', () => {
  it('renders label and value correctly', () => {
    const { container } = render(<KpiCard label="Total Revenue" value="$12,345" />);

    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('$12,345')).toBeInTheDocument();
    expect(container.querySelector('.kpi-sub')).toBeNull();
  });

  it('renders subtext conditionally', () => {
    render(<KpiCard label="Active Users" value="1,200" sub="+12% this week" />);

    expect(screen.getByText('+12% this week')).toBeInTheDocument();
  });

  it('matches the baseline snapshot', () => {
    const { container } = render(<KpiCard label="Win Rate" value="65%" sub="Moving Average" />);
    expect(container).toMatchSnapshot();
  });
});
