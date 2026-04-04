import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import WatchlistTab from '../../src/components/WatchlistTab';

describe('WatchlistTab Component', () => {
  const mockWatchlist = ['AAPL', 'TSLA'];
  const mockWatchlistMeta = {
    AAPL: { source: 'today', addedAt: '2026-04-01T10:00:00Z' },
    TSLA: { source: 'custom', addedAt: '2026-04-01T12:00:00Z' },
  };

  const mockProps = {
    watchlist: mockWatchlist,
    watchlistMeta: mockWatchlistMeta,
    signals: [],
    marketInstruments: [],
    locale: 'zh',
    onAskAi: vi.fn(),
    onToggleWatchlist: vi.fn(),
    onOpenMenu: vi.fn(),
  };

  it('renders symbols correctly based on meta sources', () => {
    render(<WatchlistTab {...mockProps} />);

    // 检查符号是否正确渲染
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('TSLA')).toBeInTheDocument();

    // 验证分类标题是否出现
    expect(screen.getByText(/来自 Today 的保存/i)).toBeInTheDocument();
    expect(screen.getByText(/我手动加入的收藏/i)).toBeInTheDocument();
  });

  it('renders custom AI rating text for manual items', () => {
    render(<WatchlistTab {...mockProps} />);
    // TSLA 是 custom source，应该显示评级文本
    expect(screen.getAllByText(/当前 AI 评级/i).length).toBeGreaterThan(0);
  });

  it('renders empty state correctly', () => {
    render(<WatchlistTab {...mockProps} watchlist={[]} watchlistMeta={{}} />);
    // 应该出现两个“这里还没有内容”，每个文件夹一个
    expect(screen.getAllByText(/这里还没有内容/i).length).toBeGreaterThanOrEqual(1);
  });
});
