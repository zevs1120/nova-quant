export function triggerDeviceFeedback(kind = 'soft') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (kind === 'confirm') {
    navigator.vibrate([8, 22, 10]);
    return;
  }
  navigator.vibrate(8);
}
