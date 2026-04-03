import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import HeroSection from '../../landing/src/components/HeroSection';

describe('Landing HeroSection Defense', () => {
  it('renders critical marketing entry point successfully', () => {
    // The component is largely static UI, checking if it mounts prevents regressions
    // introduced by bad layout CSS or broken imports.
    const { container } = render(<HeroSection />);
    expect(container).toBeInTheDocument();
    expect(container.textContent.length).toBeGreaterThan(0);
  });
});
