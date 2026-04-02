// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInvestorDemo } from '../../src/hooks/useInvestorDemo.js';
import { initialData } from '../../src/config/appConstants.js';

describe('useInvestorDemo', () => {
  const base = () => ({
    assetClass: 'US_STOCK',
    canUseInvestorDemo: true,
    setAssetClass: vi.fn(),
    market: 'US',
    setMarket: vi.fn(),
    holdings: [],
    setHoldings: vi.fn(),
    watchlist: [],
    setWatchlist: vi.fn(),
    executions: [],
    setExecutions: vi.fn(),
    setOnboardingDone: vi.fn(),
    setActiveTab: vi.fn(),
    setMyStack: vi.fn(),
    authSession: { userId: 'admin' },
    data: initialData,
  });

  it('disables demo when canUseInvestorDemo becomes false', async () => {
    localStorage.setItem('nova-quant-investor-demo-enabled', 'true');
    const { result, rerender } = renderHook((props) => useInvestorDemo(props), {
      initialProps: { ...base(), canUseInvestorDemo: true },
    });
    await waitFor(() => expect(result.current.investorDemoEnabled).toBe(true));
    rerender({ ...base(), canUseInvestorDemo: false });
    await waitFor(() => expect(result.current.investorDemoEnabled).toBe(false));
  });

  it('enableInvestorDemo sets demo holdings and navigation', () => {
    const setHoldings = vi.fn();
    const setAssetClass = vi.fn();
    const setMarket = vi.fn();
    const setOnboardingDone = vi.fn();
    const setActiveTab = vi.fn();
    const setMyStack = vi.fn();
    const { result } = renderHook(() =>
      useInvestorDemo({
        ...base(),
        setHoldings,
        setAssetClass,
        setMarket,
        setOnboardingDone,
        setActiveTab,
        setMyStack,
      }),
    );
    act(() => result.current.enableInvestorDemo());
    expect(setHoldings).toHaveBeenCalled();
    expect(setAssetClass).toHaveBeenCalledWith('US_STOCK');
    expect(setMarket).toHaveBeenCalledWith('US');
    expect(setActiveTab).toHaveBeenCalledWith('today');
  });

  it('clearInvestorDemo restores backup holdings', () => {
    const setHoldings = vi.fn();
    const { result } = renderHook(() =>
      useInvestorDemo({
        ...base(),
        setHoldings,
      }),
    );
    act(() => result.current.enableInvestorDemo());
    act(() => result.current.clearInvestorDemo());
    expect(setHoldings).toHaveBeenCalled();
  });
});
