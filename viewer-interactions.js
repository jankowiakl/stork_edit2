(function attachViewerInteractions(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.StorkViewerInteractions = api;
})(typeof globalThis === "object" ? globalThis : this, function createViewerInteractions() {
  "use strict";

  function swipeDecision({ dx = 0, dy = 0, durationMs = 1, width = 0, canNavigate = true } = {}) {
    const horizontalDistance = Math.abs(Number(dx) || 0);
    const verticalDistance = Math.abs(Number(dy) || 0);
    const stageWidth = Math.max(1, Number(width) || 1);
    const duration = Math.max(1, Number(durationMs) || 1);
    const direction = dx < 0 ? 1 : -1;
    const horizontalIntent = horizontalDistance >= 12 && horizontalDistance > verticalDistance * 1.12;
    const distanceThreshold = Math.min(96, Math.max(48, stageWidth * 0.18));
    const velocity = horizontalDistance / duration;
    const committedByDistance = horizontalDistance >= distanceThreshold;
    const committedByVelocity = horizontalDistance >= 20 && velocity >= 0.5;
    return {
      direction,
      horizontalIntent,
      velocity,
      distanceThreshold,
      commit: Boolean(horizontalIntent && canNavigate && (committedByDistance || committedByVelocity)),
      resistedX: canNavigate ? dx : dx * 0.24
    };
  }

  function chooseInitialBird(ids, photoCountFor, lastAutomaticBird, randomValue = Math.random()) {
    const available = Array.from(ids || []).filter((id) => Number(photoCountFor(id)) > 0);
    if (!available.length) return null;
    const alternatives = available.length > 1
      ? available.filter((id) => String(id) !== String(lastAutomaticBird || ""))
      : available;
    const pool = alternatives.length ? alternatives : available;
    const random = Math.max(0, Math.min(0.999999999, Number(randomValue) || 0));
    return pool[Math.floor(random * pool.length)];
  }

  function surveyViewportWidthsMatch(viewportWidth, widths, tolerance = 2) {
    const expected = Number(viewportWidth);
    if (!Number.isFinite(expected) || expected <= 0) return false;
    return Object.values(widths || {}).every((value) => {
      const width = Number(value);
      return Number.isFinite(width) && Math.abs(width - expected) <= Math.max(0, Number(tolerance) || 0);
    });
  }

  return { swipeDecision, chooseInitialBird, surveyViewportWidthsMatch };
});
