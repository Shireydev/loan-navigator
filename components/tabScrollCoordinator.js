const listeners = new Set();

export function subscribeToTabScrollRequest(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function requestTabScrollToTop(destination) {
  // tabPress fires before React Navigation finishes changing focus. A short
  // delayed request targets the selected tab after focus has transferred. The
  // second pass covers slower native transitions without animating or jitter.
  [60, 180].forEach((delay) => {
    setTimeout(() => {
      listeners.forEach((listener) => listener(destination));
    }, delay);
  });
}
