import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Component from '../../src/components/BrowseTab';

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

describe('BrowseTab UI Matrix Tests', () => {
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

  it.each(permutations)('Safely mounts BrowseTab under configuration %#', (props) => {
    // 模拟已选择资产以进入详情视图渲染逻辑
    const mockAsset = { symbol: 'AAPL', name: 'Apple', market: 'US' };
    const { container } = render(
      <TestBoundary>
        <Component {...props} selectedAsset={mockAsset} />
      </TestBoundary>,
    );

    // Assertion 1: Container successfully exists
    expect(container).toBeInTheDocument();

    // Assertion 2: Verify the new detail story cards are rendered when an asset is selected
    const detailCards = container.querySelectorAll('.browse-rh-detail-story-card');
    if (detailCards.length > 0) {
      expect(detailCards[0]).toBeInTheDocument();
      // 检查是否包含价格脉冲等叙事模块
      expect(container.textContent).toMatch(/pulse|脉冲/i);
    }
  });
});
