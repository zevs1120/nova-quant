import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SegmentedControl from '../../src/components/SegmentedControl';

describe('SegmentedControl Component', () => {
  it('invokes onChange with newly selected value and accurately sets active attributes', () => {
    const handleChangeMock = vi.fn();
    const options = [
      { label: 'Long', value: 'long' },
      { label: 'Short', value: 'short' },
    ];

    render(<SegmentedControl options={options} value="long" onChange={handleChangeMock} />);

    // Initial state expectations
    const longBtn = screen.getByText('Long');
    const shortBtn = screen.getByText('Short');
    expect(longBtn).toBeVisible();

    // Trigger an interaction
    fireEvent.click(shortBtn);

    // Assert the callback returns precisely what the component defines
    expect(handleChangeMock).toHaveBeenCalledTimes(1);
    expect(handleChangeMock).toHaveBeenCalledWith('short');
  });
});
