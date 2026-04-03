import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import BillingCheckoutSheet from '../../src/components/BillingCheckoutSheet';

describe('BillingCheckoutSheet Component', () => {
  it('renders auth requirement copy gracefully', () => {
    const mockCheckoutState = { mode: 'auth_required', planKey: 'pro', billingCycle: 'monthly' };
    const { container } = render(
      <BillingCheckoutSheet open={true} checkoutState={mockCheckoutState} locale="en" />,
    );

    // Checking auth block wording
    expect(container.textContent).toMatch(/Sign in first/i);
  });

  it('renders portal downgrade path correctly', () => {
    const mockCheckoutState = { mode: 'portal', planKey: 'lite' };
    const { container } = render(
      <BillingCheckoutSheet open={true} checkoutState={mockCheckoutState} locale="en" />,
    );

    expect(container.textContent).toMatch(/Billing Portal/i);
    expect(container.textContent).toMatch(/Open billing portal/i);
  });
});
