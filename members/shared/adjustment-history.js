const clone = (value) => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createAdjustmentHistory(getState, applyState, onAvailabilityChange = () => {}) {
  let baseline = clone(getState()), gestureStart = null, timer = 0;
  const undoStack = [], redoStack = [];
  const notify = () => onAvailabilityChange({ canUndo: undoStack.length > 0 || !!gestureStart, canRedo: redoStack.length > 0 });
  function finalize() {
    clearTimeout(timer); timer = 0;
    if (!gestureStart) return;
    const current = clone(getState());
    if (!same(gestureStart, current)) undoStack.push(gestureStart);
    gestureStart = null; baseline = current; redoStack.length = 0; notify();
  }
  function changed() {
    if (!gestureStart) gestureStart = clone(baseline);
    baseline = clone(getState());
    clearTimeout(timer); timer = setTimeout(finalize, 280); notify();
  }
  function undo() {
    finalize();
    const previous = undoStack.pop(); if (!previous) return;
    redoStack.push(clone(getState())); baseline = clone(previous); applyState(clone(previous)); notify();
  }
  function redo() {
    finalize();
    const next = redoStack.pop(); if (!next) return;
    undoStack.push(clone(getState())); baseline = clone(next); applyState(clone(next)); notify();
  }
  return { changed, undo, redo, finalize, availability: () => ({ canUndo: undoStack.length > 0 || !!gestureStart, canRedo: redoStack.length > 0 }) };
}
