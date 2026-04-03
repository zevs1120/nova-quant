import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import FirstRunSetupFlow from '../../src/components/FirstRunSetupFlow';

describe('FirstRunSetupFlow Component', () => {
  it('renders successfully without crashing', () => {
    const onCompleteMock = vi.fn();
    const { container } = render(<FirstRunSetupFlow onComplete={onCompleteMock} />);

    // Checking if the flow UI wrapper renders
    expect(container).toBeInTheDocument();
  });
});
