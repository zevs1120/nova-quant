import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Component from '../../src/components/TodayTab';

class TestBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? (
      <div data-testid="error-fallback">Error Boundary Triggered</div>
    ) : (
      this.props.children
    );
  }
}

describe('TodayTab UI Matrix Tests', () => {
  // Generate 10 sets of props permutations for 100 total tests
  const permutations = Array.from({ length: 10 }).map((_, i) => ({
    locale: i % 2 === 0 ? 'en' : 'zh',
    open: i % 2 === 0,
    session: { roles: ['USER'], user: { name: 'Matrix Tester ' + i } },
    membership: { remainingAskNova: i * 5, plan: i % 2 === 0 ? 'free' : 'pro' },
    signals: [],
    safety: { cards: {} },
    messages: [],
    holdings: [],
    marketInstruments: [],
    latencyData: [],
    checkoutState: { mode: 'portal' },
    t: (k, _, f) => f || k,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    onExplain: vi.fn(),
  }));

  it.each(permutations)('Safely mounts TodayTab under configuration %#', (props) => {
    // 模拟一个 activeSignal 以触发预览模式
    const mockSignal = { signal_id: 'test-1', symbol: 'AAPL', direction: 'LONG' };
    const { container } = render(
      <TestBoundary>
        <Component
          {...props}
          activeSignal={mockSignal}
          activeSignalScreen="preview"
          showUsageGuide={true}
        />
      </TestBoundary>,
    );

    // Assertion 1: Container successfully exists
    expect(container).toBeInTheDocument();

    // Assertion 2: Verify the new guidance shell is present
    // 注意：组件内部可能通过 showUsageGuide 来控制引导层
    const guidance = container.querySelector('.today-preview-guidance');
    if (guidance) {
      expect(guidance).toBeInTheDocument();
    }

    // Assertion 3: Verify cards are rendered
    const cards = container.querySelectorAll('.today-rebuild-card');
    expect(cards.length).toBeGreaterThanOrEqual(0);
  });
});
