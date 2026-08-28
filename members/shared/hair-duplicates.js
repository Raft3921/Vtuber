export function restoreHairDuplicates(raw, defs, motions, hitImages, makeHitImage) {
  const originals = new Map(defs.map((part) => [part.id, part]));
  for (const [id, values] of Object.entries(raw || {})) {
    if (!values?.duplicateOf || defs.some((part) => part.id === id)) continue;
    const source = originals.get(values.duplicateOf) || defs.find((part) => part.id === values.duplicateOf);
    if (!source) continue;
    const part = { ...source, id, label: values.duplicateLabel || `${source.label} のコピー`, duplicateOf: source.id };
    defs.push(part);
    motions.push({ angle: 0, velocity: 0, phase: motions.length * .83 });
    hitImages.push(makeHitImage(part, defs.length - 1));
  }
}

export function duplicateHairPart(sourceId, defs, motions, hitImages, makeHitImage, adjustments, defaultAdjustment) {
  const source = defs.find((part) => part.id === sourceId);
  if (!source) return null;
  const rootId = source.duplicateOf || source.id;
  let serial = 1, id;
  do id = `${rootId}-copy-${serial++}`; while (adjustments[id]);
  const label = `${source.label.replace(/ のコピー(?: \d+)?$/, "")} のコピー ${serial - 1}`;
  const part = { ...source, id, label, duplicateOf: rootId };
  defs.push(part);
  motions.push({ angle: 0, velocity: 0, phase: motions.length * .83 });
  hitImages.push(makeHitImage(part, defs.length - 1));
  adjustments[id] = {
    ...defaultAdjustment(),
    ...adjustments[sourceId],
    x: (Number(adjustments[sourceId]?.x) || 0) + 24,
    y: (Number(adjustments[sourceId]?.y) || 0) + 18,
    duplicateOf: rootId,
    duplicateLabel: label,
  };
  return id;
}
