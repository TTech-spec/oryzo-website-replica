/**
 * The floating coaster that accompanies the sections below the pinned stage. The sections work
 * out where it should be from their own layout and write it here; the stage reads it each frame.
 */
export const stackState = {
  active: false,
  /** 0-1: rises into view. 1-2: tumbles through three turns. */
  animation: 0,
  /** Vertical shift of the view in screen heights (1 = a full screen lower). */
  viewOffsetY: 0,
  /** Fraction of the screen, measured up from the bottom, it may draw into. */
  clip: 0,
};
