/**
 * Normalize entry / stop / take-profit fields from heterogeneous signal payloads.
 */
export function resolveSignalEntryBounds(signal) {
  const entryMin = signal.entry_zone?.low ?? signal.entry_zone?.min ?? signal.entry_min;
  const entryMax = signal.entry_zone?.high ?? signal.entry_zone?.max ?? signal.entry_max;
  const stopLossPrice = signal.stop_loss?.price ?? signal.stop_loss_value ?? signal.stop_loss;
  const takeProfitLevels =
    signal.take_profit_levels && signal.take_profit_levels.length
      ? signal.take_profit_levels.map((level) => (typeof level === 'number' ? level : level.price))
      : [signal.take_profit].filter((value) => value !== null && value !== undefined);
  return { entryMin, entryMax, stopLossPrice, takeProfitLevels };
}
